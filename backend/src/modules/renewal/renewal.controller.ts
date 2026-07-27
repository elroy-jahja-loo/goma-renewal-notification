import { Controller, Get, HttpCode, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';
import { RenewalService } from './renewal.service';
import { RenewalFilterDto } from './dto/renewal-filter.dto';
import { RenewalStatus, SortField } from './dto/renewal-filter.dto';
import { RenewalPaginatedResponse } from './dto/renewal-response.dto';

@ApiTags('Renewals')
@Controller('api')
export class RenewalController {
  constructor(private readonly renewalService: RenewalService) {}

  @Get('renewals')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List renewals with filtering and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'status', required: false, enum: RenewalStatus, description: 'Filter by renewal status' })
  @ApiQuery({ name: 'adviser', required: false, type: String, description: 'Filter by adviser name (partial match)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: SortField, description: 'Field to sort by', example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort direction', example: 'desc' })
  @ApiResponse({ status: 200, description: 'Paginated list of renewals' })
  @ApiResponse({ status: 400, description: 'Invalid filter parameters' })
  async getRenewals(@Query() filters: RenewalFilterDto): Promise<RenewalPaginatedResponse> {
    return this.renewalService.getRenewals(filters);
  }

  @Get('renewals/errors/:batchId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Download CSV error report for a given upload batch' })
  @ApiParam({ name: 'batchId', type: String, description: 'Upload batch ID' })
  @ApiResponse({ status: 200, description: 'CSV error report' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async downloadErrors(@Param('batchId') batchId: string, @Res() res: Response): Promise<void> {
    const rows = await this.renewalService.getErrorReport(batchId);

    if (!rows.length) {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'No errors found for this batch' });
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      });
      csvLines.push(values.join(','));
    }

    const csv = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="errors-${batchId}.csv"`);
    res.send(csv);
  }
}
