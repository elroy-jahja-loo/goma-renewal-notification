import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RenewalService } from '../../src/modules/renewal/renewal.service';
import { RenewalRepository } from '../../src/modules/renewal/repositories/renewal.repository';

describe('RenewalService', () => {
  let service: RenewalService;
  let mockRepo: jest.Mocked<any>;
  let mockLogger: jest.Mocked<any>;

  const mockRenewals = {
    data: [
      {
        id: '1',
        clientName: 'Acme Corp',
        policyName: 'Health Plus',
        renewalDate: '2026-12-31',
        premium: 1200.5,
        adviserName: 'John Doe',
        adviserPhone: '+6591234567',
        status: 'pending',
      },
      {
        id: '2',
        clientName: 'Beta Ltd',
        policyName: 'Life Secure',
        renewalDate: '2026-11-15',
        premium: 800,
        adviserName: 'Jane Smith',
        adviserPhone: '+6598765432',
        status: 'sent',
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    },
  };

  beforeEach(async () => {
    mockRepo = {
      findAll: jest.fn().mockResolvedValue(mockRenewals),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findPending: jest.fn().mockResolvedValue([]),
      getErrorReport: jest.fn().mockResolvedValue([]),
    };

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenewalService,
        { provide: RenewalRepository, useValue: mockRepo },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(RenewalService);
  });

  it('should return paginated results with correct structure', async () => {
    const result = await service.getRenewals({ page: 1, limit: 10 });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
    expect(result.pagination.page).toBe(1);
  });

  it('should filter by status', async () => {
    await service.getRenewals({ status: 'pending' as any });

    expect(mockRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('should filter by adviser partial match', async () => {
    await service.getRenewals({ adviser: 'John' });

    expect(mockRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ adviser: 'John' }),
    );
  });

  it('should sort by renewalDate', async () => {
    await service.getRenewals({ sortBy: 'renewalDate' as any, sortOrder: 'asc' });

    expect(mockRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'renewalDate', sortOrder: 'asc' }),
    );
  });

  it('should return empty array when no results', async () => {
    mockRepo.findAll.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const result = await service.getRenewals({ page: 1, limit: 10 });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});
