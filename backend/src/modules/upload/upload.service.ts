import { Injectable, Inject, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { RenewalRowDto } from '../renewal/dto/renewal-row.dto';
import { UploadResponse } from './dto/upload-response.dto';
import { ExcelParserService } from './parsers/excel-parser.service';

interface ValidRenewal {
  client_name: string;
  policy_name: string;
  renewal_date: string;
  premium: number | null;
  adviser_name: string;
  adviser_phone: string;
  status: string;
  upload_batch: string;
  hash: string;
}

interface FailedRenewal {
  upload_batch: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  errors: string[];
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly parser: ExcelParserService,
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {}

  async processUpload(
    fileBuffer: Buffer,
    filename: string,
    originalname: string,
  ): Promise<UploadResponse> {
    this.logger.log(`Processing file: ${originalname}`);

    const parsedRows = this.parser.parseFile(fileBuffer, originalname);

    if (parsedRows.length === 0) {
      throw new InternalServerErrorException(
        'No recognized data found in the uploaded file. Please ensure your spreadsheet contains the required columns: Adviser, Adviser Phone, Client, Policy, and Renewal Date.',
      );
    }

    if (parsedRows.length > 10000) {
      throw new BadRequestException(
        `This file contains ${parsedRows.length.toLocaleString()} rows. The maximum is 10,000 rows. Please split your data into smaller files.`,
      );
    }

    const validRows: ValidRenewal[] = [];
    const invalidRows: FailedRenewal[] = [];
    const seenHashes = new Set<string>();

    for (const row of parsedRows) {
      const errors: string[] = [];
      const dto = plainToInstance(RenewalRowDto, {
        adviser: row.data.adviser,
        adviserPhone: row.data.adviserPhone,
        client: row.data.client,
        policy: row.data.policy,
        renewalDate: row.data.renewalDate,
        premium: row.data.premium !== undefined
          ? (() => {
              const p = parseFloat(row.data.premium!);
              return (isNaN(p) || !isFinite(p)) ? NaN : p;
            })()
          : undefined,
      });

      const validationErrors = await validate(dto);

      if (validationErrors.length > 0) {
        for (const err of validationErrors) {
          const msgs = Object.values(err.constraints || {});
          errors.push(...msgs);
        }
      }

      if (row.data.renewalDate) {
        const date = new Date(row.data.renewalDate + 'T00:00:00+08:00');
        const now = new Date();
        const todaySg = new Date(
          now.toLocaleString('en-CA', { timeZone: 'Asia/Singapore' }).split(',')[0] + 'T00:00:00+08:00',
        );
        if (isNaN(date.getTime())) {
          errors.push('This date is not valid. Use a real date like 2026-08-15.');
        } else if (date < todaySg) {
          errors.push(`This renewal date (${row.data.renewalDate}) is in the past. Please use a future date.`);
        }
      }

      if (errors.length > 0) {
        invalidRows.push({
          upload_batch: '',
          row_number: row.rowNumber,
          raw_data: { ...row.data },
          errors,
        });
        continue;
      }

      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            client: row.data.client!.toLowerCase(),
            policy: row.data.policy!.toLowerCase(),
            renewalDate: row.data.renewalDate,
            adviser: row.data.adviser!.toLowerCase(),
          }),
        )
        .digest('hex');

      if (seenHashes.has(hash)) {
        continue;
      }
      seenHashes.add(hash);

      validRows.push({
        client_name: row.data.client!,
        policy_name: row.data.policy!,
        renewal_date: row.data.renewalDate!,
        premium: row.data.premium !== undefined
          ? (() => {
              const p = parseFloat(row.data.premium!);
              return (isNaN(p) || !isFinite(p)) ? null : p;
            })()
          : null,
        adviser_name: row.data.adviser!,
        adviser_phone: row.data.adviserPhone!,
        status: 'pending',
        upload_batch: '',
        hash,
      });
    }

    const { data: batch, error: batchError } = await this.supabase
      .from('upload_batches')
      .insert({
        filename: originalname,
        total_rows: parsedRows.length,
        valid_rows: validRows.length,
        invalid_rows: invalidRows.length,
      })
      .select()
      .single();

    if (batchError || !batch) {
      this.logger.error('Failed to create upload batch', batchError);
      throw new InternalServerErrorException('Failed to process upload');
    }

    const batchId = batch.id;

    validRows.forEach((row) => {
      row.upload_batch = batchId;
    });

    if (validRows.length > 0) {
      const { error: insertError } = await this.supabase
        .from('renewals')
        .upsert(validRows, {
          onConflict: 'hash',
          ignoreDuplicates: true,
        });

      if (insertError) {
        this.logger.error('Failed to insert valid rows', insertError);
        throw new InternalServerErrorException('Failed to save renewal data');
      }
    }

    if (invalidRows.length > 0) {
      const invalidData = invalidRows.map((row) => ({
        ...row,
        upload_batch: batchId,
      }));

      const { error: failError } = await this.supabase
        .from('failed_renewals')
        .insert(invalidData);

      if (failError) {
        this.logger.error('Failed to insert invalid rows', failError);
      }
    }

    this.logger.log(
      `Upload complete: ${validRows.length} valid, ${invalidRows.length} invalid`,
    );

    return {
      batchId,
      filename: originalname,
      totalRows: parsedRows.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      errorReportUrl: `/api/renewals/errors/${batchId}`,
    };
  }
}
