import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';

export interface ParsedRow {
  rowNumber: number;
  data: {
    adviser?: string;
    adviserPhone?: string;
    client?: string;
    policy?: string;
    renewalDate?: string;
    premium?: string;
  };
}

const HEADER_MAP: Record<string, string> = {
  adviser: 'adviser',
  'adviser phone': 'adviserPhone',
  'adviser_phone': 'adviserPhone',
  adviserphone: 'adviserPhone',
  client: 'client',
  policy: 'policy',
  'renewal date': 'renewalDate',
  'renewal_date': 'renewalDate',
  renewaldate: 'renewalDate',
  premium: 'premium',
};

@Injectable()
export class ExcelParserService {
  parseFile(fileBuffer: Buffer, filename: string): ParsedRow[] {
    const extension = filename.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      return this.parseCsv(fileBuffer);
    }
    if (extension === 'xlsx' || extension === 'xls') {
      return this.parseXlsx(fileBuffer);
    }

    throw new BadRequestException(`Unsupported file type: .${extension}`);
  }

  private parseXlsx(buffer: Buffer): ParsedRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Excel file contains no sheets');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) {
      throw new BadRequestException('Excel file is empty or has no data rows');
    }

    const headers = (rows[0] as string[]).map((h) => String(h).trim().toLowerCase());
    return this.mapRows(headers, rows.slice(1));
  }

  private parseCsv(buffer: Buffer): ParsedRow[] {
    const content = buffer.toString('utf-8').trim();
    if (!content) {
      throw new BadRequestException('CSV file is empty');
    }

    const records: string[][] = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
    });

    if (records.length < 2) {
      throw new BadRequestException('CSV file has no data rows');
    }

    const headers = records[0].map((h) => String(h).trim().toLowerCase());
    return this.mapRows(headers, records.slice(1));
  }

  private mapRows(headers: string[], dataRows: any[][]): ParsedRow[] {
    return dataRows.map((row, index) => {
      const data: ParsedRow['data'] = {};
      headers.forEach((header, colIndex) => {
        const mappedKey = HEADER_MAP[header];
        if (mappedKey) {
          const value = row[colIndex];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            data[mappedKey as keyof ParsedRow['data']] = String(value).trim();
          }
        }
      });
      return { rowNumber: index + 2, data };
    }).filter((row) => Object.keys(row.data).length > 0);
  }
}
