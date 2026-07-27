import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { TelegramService } from '../../src/modules/telegram/telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let mockSupabase: jest.Mocked<any>;
  let mockLogger: jest.Mocked<any>;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { chat_id: null, is_connected: false },
        error: null,
      }),
    };

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: PinoLogger, useValue: mockLogger },
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get(TelegramService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should send message successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
    }) as any;

    const result = await service.sendMessage('123456789', 'Hello World');

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(callUrl).toContain('https://api.telegram.org');
    expect(callUrl).toContain('sendMessage');
  });

  it('should return false on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    }) as any;

    const result = await service.sendMessage('123456789', 'Hello');

    expect(result).toBe(false);
  });

  it('should detect chat_id from getUpdates', async () => {
    mockSupabase.upsert.mockResolvedValue({ error: null });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ok: true,
        result: [
          {
            update_id: 1,
            message: {
              message_id: 1,
              chat: { id: 987654321, type: 'private' },
              text: '/start',
            },
          },
        ],
      }),
    }) as any;

    const chatId = await service.detectChatId();

    expect(chatId).toBe('987654321');
    expect(mockSupabase.upsert).toHaveBeenCalled();
  });

  it('should return disconnected status when no config', async () => {
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    });

    const status = await service.getStatus();

    expect(status).toBeDefined();
    expect(status.connected).toBe(false);
    expect(status.instructions).toBeDefined();
  });
});
