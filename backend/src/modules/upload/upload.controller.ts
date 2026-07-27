import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response, Express } from 'express';
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe';
import { UploadService } from './upload.service';
import type { UploadResponse } from './dto/upload-response.dto';
import { QueueService } from '../queue/queue.service';
import { supabase } from '../../database/supabase';

@ApiTags('Upload')
@Controller('api/renewals')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly uploadService: UploadService,
    private readonly queueService: QueueService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a renewal Excel/CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel (.xlsx/.xls) or CSV file',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Upload processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  async upload(
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  ): Promise<UploadResponse> {
    this.logger.log(`Receiving file: ${file.originalname} (${file.size} bytes)`);
    return this.uploadService.processUpload(
      file.buffer,
      file.originalname,
      file.originalname,
    );
  }

  @Get('errors/:batchId')
  @ApiOperation({ summary: 'Download error report for a batch' })
  @ApiParam({ name: 'batchId', description: 'Upload batch ID' })
  @ApiResponse({ status: 200, description: 'CSV error report' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async downloadErrors(
    @Param('batchId') batchId: string,
    @Res() res: Response,
  ) {
    const { data: failedRows, error } = await supabase
      .from('failed_renewals')
      .select('row_number, raw_data, errors')
      .eq('upload_batch', batchId)
      .order('row_number', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch error report', error);
      return res.status(500).json({ message: 'Failed to generate error report' });
    }

    if (!failedRows || failedRows.length === 0) {
      return res.status(404).json({ message: 'No errors found for this batch' });
    }

    const csvLines = ['Row,Field,Original Value,Error'];
    for (const row of failedRows) {
      const rowData = row.raw_data as Record<string, unknown>;
      for (const err of row.errors) {
        const field = this.extractFieldFromError(err);
        const value = field ? String(rowData[field] || '') : '';
        csvLines.push(
          `${row.row_number},"${field}","${value.replace(/"/g, '""')}","${err.replace(/"/g, '""')}"`,
        );
      }
    }

    const csvContent = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="error-report-${batchId}.csv"`,
    );
    res.send(csvContent);
  }

  @Post('process')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 1000 } })
  @ApiOperation({ summary: 'Trigger immediate processing of pending renewals within 30 days' })
  @ApiResponse({ status: 200, description: 'Renewals enqueued' })
  async processNow(): Promise<{ processed: number; message: string }> {
    this.logger.log('Manual process triggered');
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const cutoff = thirtyDaysFromNow.toISOString().split('T')[0];

    const { data: pending, error } = await supabase
      .from('renewals')
      .select('id, client_name, policy_name, renewal_date, premium, adviser_name, adviser_phone')
      .eq('status', 'pending')
      .lte('renewal_date', cutoff)
      .order('created_at', { ascending: true });

    if (error || !pending || pending.length === 0) {
      return { processed: 0, message: 'No pending renewals within 30 days to process' };
    }

    await this.queueService.addJobs(
      pending.map((r: any) => ({
        id: r.id,
        clientName: r.client_name,
        policyName: r.policy_name,
        renewalDate: r.renewal_date,
        premium: r.premium,
        adviserName: r.adviser_name,
        adviserPhone: r.adviser_phone,
      })),
    );

    this.logger.log(`Manual process enqueued ${pending.length} renewals`);
    return { processed: pending.length, message: `${pending.length} renewals enqueued for processing` };
  }

  private extractFieldFromError(error: string): string {
    if (error.toLowerCase().includes('adviser')) return 'adviser';
    if (error.toLowerCase().includes('phone')) return 'adviserPhone';
    if (error.toLowerCase().includes('client')) return 'client';
    if (error.toLowerCase().includes('policy')) return 'policy';
    if (error.toLowerCase().includes('date')) return 'renewalDate';
    if (error.toLowerCase().includes('premium')) return 'premium';
    return '';
  }
}
