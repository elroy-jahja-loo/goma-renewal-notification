import { IsString, IsDateString, IsNumber, IsOptional, Min, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RenewalRowDto {
  @ApiProperty({ description: 'Adviser full name', example: 'Sarah Lee' })
  @IsString()
  @MaxLength(100)
  adviser: string;

  @ApiProperty({ description: 'Adviser phone (SG format)', example: '+65 9123 4567' })
  @IsString()
  @Matches(/^(\+65\s?)?[689]\d{3}\s?\d{4}$/, {
    message: 'Phone must be a valid Singapore number (e.g. +65 9123 4567 or 9123 4567)',
  })
  adviserPhone: string;

  @ApiProperty({ description: 'Client full name', example: 'John Tan' })
  @IsString()
  @MaxLength(100)
  client: string;

  @ApiProperty({ description: 'Policy name', example: 'Elite Whole Life' })
  @IsString()
  @MaxLength(200)
  policy: string;

  @ApiProperty({ description: 'Renewal date (ISO 8601)', example: '2026-08-15' })
  @IsDateString({ strict: true }, { message: 'Renewal date must be a valid date in YYYY-MM-DD format' })
  renewalDate: string;

  @ApiPropertyOptional({ description: 'Premium amount in SGD', example: 2800 })
  @IsOptional()
  @IsNumber({}, { message: 'Premium must be a number' })
  @Min(0)
  premium?: number;
}
