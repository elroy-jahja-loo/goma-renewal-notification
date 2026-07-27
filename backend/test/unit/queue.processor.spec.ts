jest.mock('bullmq', () => ({
  Worker: jest.fn(),
  Queue: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RenewalProcessor } from '../../src/modules/queue/queue.processor';
import { AiService } from '../../src/modules/ai/ai.service';
import { TelegramService } from '../../src/modules/telegram/telegram.service';
import { RateLimiterService } from '../../src/modules/queue/rate-limiter.service';

describe('RenewalProcessor', () => {
  let processor: RenewalProcessor;
  let mockAiService: any;
  let mockTelegramService: any;
  let mockRateLimiterService: any;
  let mockSupabase: any;
  let mockLogger: any;

  beforeEach(async () => {
    mockAiService = {
      generateMessage: jest
        .fn()
        .mockResolvedValue('Generated reminder message'),
    };

    mockTelegramService = {
      sendMessage: jest.fn().mockResolvedValue(true),
    };

    mockRateLimiterService = {
      tryConsume: jest.fn().mockReturnValue(true),
    };

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { chat_id: '123456789' },
        error: null,
      }),
      order: jest.fn().mockReturnThis(),
    };

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenewalProcessor,
        { provide: AiService, useValue: mockAiService },
        { provide: TelegramService, useValue: mockTelegramService },
        { provide: RateLimiterService, useValue: mockRateLimiterService },
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get(RenewalProcessor);

    Object.defineProperty(processor, 'onModuleInit', { value: jest.fn() });
    Object.defineProperty(processor, 'onModuleDestroy', { value: jest.fn() });
  });

  it('should process job and update status to sent', async () => {
    const mockJob = {
      id: 'job-1',
      attemptsMade: 0,
      data: {
        renewalId: 'renewal-1',
        clientName: 'Acme Corp',
        policyName: 'Health Plus',
        renewalDate: '2026-12-31',
        premium: 1200.5,
        adviserName: 'John Doe',
        adviserPhone: '+6591234567',
      },
    };

    await (processor as any).processJob(mockJob);

    expect(mockAiService.generateMessage).toHaveBeenCalledWith({
      adviserName: 'John Doe',
      clientName: 'Acme Corp',
      policyName: 'Health Plus',
      renewalDate: '2026-12-31',
      premium: 1200.5,
    });
    expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
      '123456789',
      'Generated reminder message',
    );
    expect(mockRateLimiterService.tryConsume).toHaveBeenCalled();
  });

  it('should retry on failure', async () => {
    mockAiService.generateMessage.mockRejectedValueOnce(
      new Error('AI service error'),
    );

    const mockJob = {
      id: 'job-2',
      attemptsMade: 0,
      data: {
        renewalId: 'renewal-2',
        clientName: 'Beta Ltd',
        policyName: 'Life Secure',
        renewalDate: '2026-11-15',
        premium: 800,
        adviserName: 'Jane Smith',
        adviserPhone: '+6598765432',
      },
    };

    await expect((processor as any).processJob(mockJob)).rejects.toThrow();
    expect(mockAiService.generateMessage).toHaveBeenCalled();
  });

  it('should mark failed when no chat_id configured', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { chat_id: null },
      error: null,
    });

    const mockJob = {
      id: 'job-3',
      attemptsMade: 0,
      data: {
        renewalId: 'renewal-3',
        clientName: 'No Chat',
        policyName: 'Basic',
        renewalDate: '2026-10-01',
        premium: null,
        adviserName: 'Bob',
        adviserPhone: '+6591111111',
      },
    };

    await expect(
      (processor as any).processJob(mockJob),
    ).rejects.toThrow('No Telegram chat ID configured');

    expect(mockSupabase.from).toHaveBeenCalledWith('renewals');
  });

  it('should respect rate limiter', async () => {
    mockRateLimiterService.tryConsume.mockReturnValue(false);

    const mockJob = {
      id: 'job-4',
      attemptsMade: 0,
      data: {
        renewalId: 'renewal-1',
        clientName: 'Acme Corp',
        policyName: 'Health Plus',
        renewalDate: '2026-12-31',
        premium: 1200.5,
        adviserName: 'John Doe',
        adviserPhone: '+6591234567',
      },
    };

    const processPromise = (processor as any).processJob(mockJob);

    await new Promise((resolve) => setTimeout(resolve, 150));

    mockRateLimiterService.tryConsume.mockReturnValue(true);

    await processPromise;

    expect(mockRateLimiterService.tryConsume).toHaveBeenCalled();
  });
});
