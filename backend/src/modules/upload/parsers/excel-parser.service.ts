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

    throw new BadRequestException(
      `"${filename}" is not a supported file type. Please upload a .xlsx, .xls, or .csv file.`,
    );
  }

  private parseXlsx(buffer: Buffer): ParsedRow[] {
    let workbook;
    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        sheetRows: 10001,
        cellFormula: false,
        cellStyles: false,
        cellDates: false,
      });
    } catch {
      throw new BadRequestException(
        'Could not read this Excel file. The file may be corrupted or in an unsupported format.',
      );
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException(
        'The uploaded Excel file has no worksheets. Please add a sheet with your renewal data.',
      );
    }
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    if (rows.length < 2) {
      throw new BadRequestException(
        'The spreadsheet has headers but no data rows. Please add at least one row of renewal data below the headers.',
      );
    }

    const headers = (rows[0] as string[]).map((h) => String(h).trim().toLowerCase());
    return this.mapRows(headers, rows.slice(1));
  }

  private parseCsv(buffer: Buffer): ParsedRow[] {
    const content = buffer.toString('utf-8').trim();
    if (!content) {
      throw new BadRequestException(
        'The CSV file is completely empty. Please add your renewal data and try again.',
      );
    }

    let records: string[][];
    try {
      records = parse(content, {
        skip_empty_lines: true,
        relax_column_count: true,
      });
    } catch {
      throw new BadRequestException(
        'Could not parse this CSV file. The file may be corrupted or formatted incorrectly.',
      );
    }

    if (records.length < 2) {
      throw new BadRequestException(
        'The CSV has headers but no data rows. Please add at least one row of renewal data below the headers.',
      );
    }

    const headers = records[0].map((h) => String(h).trim().toLowerCase());
    return this.mapRows(headers, records.slice(1));
  }

  private mapRows(headers: string[], dataRows: any[][]): ParsedRow[] {
    const recognizedColumns = new Set<string>();
    headers.forEach((h) => {
      if (HEADER_MAP[h]) recognizedColumns.add(HEADER_MAP[h]);
    });

    const parsedRows = dataRows.map((row, index) => {
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

    if (parsedRows.length === 0) {
      if (recognizedColumns.size === 0) {
        const expectedColumns = ['Adviser', 'Adviser Phone', 'Client', 'Policy', 'Renewal Date'];
        throw new BadRequestException(
          `No recognized columns found. Your file must have columns named: ${expectedColumns.join(', ')}. The optional column is: Premium.`,
        );
      }
    }

    return parsedRows;
  }
}
