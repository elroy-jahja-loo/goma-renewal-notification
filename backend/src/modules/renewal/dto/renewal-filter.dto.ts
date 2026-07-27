import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum RenewalStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum SortField {
  CLIENT_NAME = 'clientName',
  POLICY_NAME = 'policyName',
  RENEWAL_DATE = 'renewalDate',
  PREMIUM = 'premium',
  ADVISER_NAME = 'adviserName',
  STATUS = 'status',
  SENT_AT = 'sentAt',
  CREATED_AT = 'createdAt',
}

export class RenewalFilterDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by status', enum: RenewalStatus })
  @IsOptional()
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @ApiPropertyOptional({ description: 'Filter by adviser name (partial match)', example: 'Sarah' })
  @IsOptional()
  @IsString()
  adviser?: string;

  @ApiPropertyOptional({ description: 'Sort field', enum: SortField, default: 'renewalDate' })
  @IsOptional()
  @IsEnum(SortField)
  sortBy?: SortField = SortField.RENEWAL_DATE;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
