const mockCreate = jest.fn();

const MockOpenAI = jest.fn(function (this: any) {
  this.chat = { completions: { create: mockCreate } };
});

jest.mock('openai', () => ({
  __esModule: true,
  default: MockOpenAI,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../../src/modules/ai/ai.service';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    mockCreate.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get(AiService);
  });

  it('should include premium line when premium > 0', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Reminder message with premium' } }],
    });

    await service.generateMessage({
      adviserName: 'John Doe',
      clientName: 'Acme Corp',
      policyName: 'Health Plus',
      renewalDate: '2026-12-31',
      premium: 1200.5,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;
    const userMessage =
      messages.find((m: any) => m.role === 'user')?.content || '';
    expect(userMessage).toContain('1200.5');
    expect(userMessage).toContain('Premium');
  });

  it('should omit premium line when premium is null', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Reminder message without premium' } }],
    });

    await service.generateMessage({
      adviserName: 'Jane Smith',
      clientName: 'Beta Ltd',
      policyName: 'Life Secure',
      renewalDate: '2026-11-15',
      premium: null,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;
    const userMessage =
      messages.find((m: any) => m.role === 'user')?.content || '';
    expect(userMessage).toContain('N/A');
    expect(userMessage).toContain('omit');
  });

  it('should format date in message', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Your renewal is due' } }],
    });

    await service.generateMessage({
      adviserName: 'Bob Lee',
      clientName: 'Gamma Inc',
      policyName: 'Gold Plan',
      renewalDate: '2026-12-31',
      premium: 500,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;
    const userMessage =
      messages.find((m: any) => m.role === 'user')?.content || '';
    expect(userMessage).toContain('2026');
  });

  it('should call OpenAI with correct model and temperature', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
    });

    await service.generateMessage({
      adviserName: 'Alice Wong',
      clientName: 'Delta Co',
      policyName: 'Silver Plan',
      renewalDate: '2027-01-15',
      premium: 200,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBeDefined();
    expect(typeof callArgs.temperature).toBe('number');
  });

  it('should throw on API error', async () => {
    mockCreate.mockRejectedValue(new Error('OpenAI API error'));

    await expect(
      service.generateMessage({
        adviserName: 'Error User',
        clientName: 'Fail Inc',
        policyName: 'Bad Plan',
        renewalDate: '2026-06-01',
        premium: 100,
      }),
    ).rejects.toThrow();
  });
});
