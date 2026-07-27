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

function excelSerialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400000;
  const date = new Date(utcMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const num = Number(trimmed);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    return excelSerialToDate(num);
  }

  const ddmmyyyy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    const d = ddmmyyyy[1].padStart(2, '0');
    const m = ddmmyyyy[2].padStart(2, '0');
    return `${ddmmyyyy[3]}-${m}-${d}`;
  }

  const monthNames =
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i.exec(trimmed);
  if (monthNames) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const d = monthNames[1].padStart(2, '0');
    const m = months[monthNames[2].toLowerCase().slice(0, 3)];
    return `${monthNames[3]}-${m}-${d}`;
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (iso) return trimmed;

  return null;
}

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
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

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
            const raw = String(value).trim();
            if (mappedKey === 'renewalDate') {
              const normalized = normalizeDate(raw);
              if (normalized) {
                data.renewalDate = normalized;
              }
            } else {
              data[mappedKey as keyof ParsedRow['data']] = raw;
            }
          }
        }
      });
      return { rowNumber: index + 2, data };
    }).filter((row) => Object.keys(row.data).length > 0);
  }
}
