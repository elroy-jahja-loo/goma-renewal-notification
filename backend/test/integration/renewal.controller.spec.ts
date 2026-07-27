jest.mock('../../src/database/supabase', () => ({
  supabase: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { RenewalController } from '../../src/modules/renewal/renewal.controller';
import { UploadController } from '../../src/modules/upload/upload.controller';
import { RenewalService } from '../../src/modules/renewal/renewal.service';
import { UploadService } from '../../src/modules/upload/upload.service';
import { QueueService } from '../../src/modules/queue/queue.service';

const request = require('supertest');

describe('RenewalController (Integration)', () => {
  let app: INestApplication;
  let mockRenewalService: any;
  let mockUploadService: any;

  const mockRenewals = {
    data: [
      {
        id: '1',
        clientName: 'John Doe',
        policyName: 'Health Plus',
        renewalDate: '2026-12-31',
        premium: 1200.5,
        status: 'pending',
      },
      {
        id: '2',
        clientName: 'Jane Smith',
        policyName: 'Life Secure',
        renewalDate: '2026-11-15',
        premium: 800,
        status: 'sent',
      },
    ],
    pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
  };

  beforeEach(async () => {
    mockRenewalService = {
      getRenewals: jest.fn().mockResolvedValue(mockRenewals),
      getErrorReport: jest.fn().mockResolvedValue([]),
    };

    mockUploadService = {
      processUpload: jest.fn().mockResolvedValue({
        batchId: 'batch-1',
        filename: 'test.xlsx',
        totalRows: 10,
        validRows: 7,
        invalidRows: 3,
        errorReportUrl: '/api/renewals/errors/batch-1',
      }),
    };

    const mockQueueService = {
      addJobs: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RenewalController, UploadController],
      providers: [
        { provide: RenewalService, useValue: mockRenewalService },
        { provide: UploadService, useValue: mockUploadService },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 200 on GET /api/renewals', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/renewals')
      .expect(200);

    expect(response.body).toBeDefined();
    expect(mockRenewalService.getRenewals).toHaveBeenCalled();
  });

  it('should return 200 on POST /api/renewals/upload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/renewals/upload')
      .attach('file', Buffer.from('fake-xlsx-data'), 'test.xlsx')
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.batchId).toBe('batch-1');
  });

  it('should filter by status query param', async () => {
    await request(app.getHttpServer())
      .get('/api/renewals?status=pending')
      .expect(200);

    expect(mockRenewalService.getRenewals).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });
});
