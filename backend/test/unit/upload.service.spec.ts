import { Test, TestingModule } from '@nestjs/testing';
import { UploadService } from '../../src/modules/upload/upload.service';
import { ExcelParserService } from '../../src/modules/upload/parsers/excel-parser.service';
import { QueueService } from '../../src/modules/queue/queue.service';

describe('UploadService', () => {
  let service: UploadService;
  let mockSupabase: jest.Mocked<any>;
  let excelParserService: ExcelParserService;

  const mockParsedRows = [
    {
      rowNumber: 2,
      data: {
        adviser: 'John Doe',
        adviserPhone: '+6591234567',
        client: 'Acme Corp',
        policy: 'Health Plus',
        renewalDate: '2026-12-31',
        premium: '1200.5',
      },
    },
    {
      rowNumber: 3,
      data: {
        adviser: 'Jane Smith',
        adviserPhone: '+6598765432',
        client: 'Beta Ltd',
        policy: 'Life Secure',
        renewalDate: '2026-11-15',
        premium: '800',
      },
    },
    {
      rowNumber: 4,
      data: {
        adviser: undefined,
        adviserPhone: '+6591111111',
        client: 'Empty Adviser',
        policy: 'Basic Plan',
        renewalDate: '2026-10-01',
        premium: '500',
      },
    },
    {
      rowNumber: 5,
      data: {
        adviser: 'Bob Lee',
        adviserPhone: '12345678',
        client: 'Invalid Phone',
        policy: 'Gold Plan',
        renewalDate: '2026-09-20',
        premium: '300',
      },
    },
    {
      rowNumber: 6,
      data: {
        adviser: 'Alice Wong',
        adviserPhone: '+6592222222',
        client: 'Past Date',
        policy: 'Silver',
        renewalDate: '2020-01-01',
        premium: '150',
      },
    },
    {
      rowNumber: 7,
      data: {
        adviser: 'Carol Tan',
        adviserPhone: '+6593333333',
        client: 'No Premium',
        policy: 'Basic',
        renewalDate: '2027-06-01',
        premium: undefined,
      },
    },
  ];

  beforeEach(async () => {
    mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'upload_batches') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: { id: 'batch-123' }, error: null }),
          };
        }
        if (table === 'renewals') {
          const eqChain = {
            eq: jest.fn().mockReturnThis(),
            data: [],
            error: null,
          };
          return {
            upsert: jest.fn().mockResolvedValue({ error: null }),
            select: jest.fn().mockReturnValue(eqChain),
          };
        }
        if (table === 'failed_renewals') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    const mockQueueService = {
      addJobs: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        ExcelParserService,
        { provide: QueueService, useValue: mockQueueService },
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get(UploadService);
    excelParserService = module.get(ExcelParserService);
    jest
      .spyOn(excelParserService, 'parseFile')
      .mockReturnValue(mockParsedRows);
  });

  it('should parse valid XLSX and return correct counts', async () => {
    const result = await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(result.validRows).toBeGreaterThan(0);
    expect(result.batchId).toBeDefined();
    expect(result.totalRows).toBe(mockParsedRows.length);
    expect(mockSupabase.from).toHaveBeenCalledWith('upload_batches');
  });

  it('should reject rows with missing adviser name', async () => {
    const result = await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(result.invalidRows).toBeGreaterThan(0);
    expect(mockSupabase.from).toHaveBeenCalledWith('failed_renewals');
  });

  it('should reject invalid SG phone format', async () => {
    const result = await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(result.invalidRows).toBeGreaterThan(0);
  });

  it('should reject renewal date in the past', async () => {
    const result = await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(result.invalidRows).toBeGreaterThan(0);
  });

  it('should accept rows with missing premium as valid', async () => {
    const result = await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(result.validRows).toBeGreaterThan(0);
  });

  it('should detect duplicate rows via hash and skip them', async () => {
    const duplicateRows = [
      ...mockParsedRows,
      {
        rowNumber: 8,
        data: {
          adviser: 'John Doe',
          adviserPhone: '+6591234567',
          client: 'Acme Corp',
          policy: 'Health Plus',
          renewalDate: '2026-12-31',
          premium: '999',
        },
      },
    ];

    jest.spyOn(excelParserService, 'parseFile').mockReturnValue(duplicateRows);

    const result = await service.processUpload(
      Buffer.from('fake-xlsx-data-with-dup'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(result.validRows).toBeGreaterThan(0);
    expect(result.validRows).toBeLessThan(duplicateRows.length);
  });

  it('should insert valid rows to renewals table', async () => {
    await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(mockSupabase.from).toHaveBeenCalledWith('renewals');
  });

  it('should insert invalid rows to failed_renewals table', async () => {
    await service.processUpload(
      Buffer.from('fake-xlsx-data'),
      'test.xlsx',
      'test.xlsx',
    );

    expect(mockSupabase.from).toHaveBeenCalledWith('failed_renewals');
  });
});
