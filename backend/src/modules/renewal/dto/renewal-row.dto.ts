import { IsString, IsDateString, IsNumber, IsOptional, IsNotEmpty, Min, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RenewalRowDto {
  @ApiProperty({ description: 'Adviser full name', example: 'Sarah Lee' })
  @IsString({ message: 'Adviser name must be text (cannot be empty)' })
  @IsNotEmpty({ message: 'Adviser name is required' })
  @MaxLength(100, { message: 'Adviser name is too long (maximum 100 characters)' })
  adviser: string;

  @ApiProperty({ description: 'Adviser phone (SG format)', example: '+65 9123 4567' })
  @IsString({ message: 'Adviser phone must be text' })
  @IsNotEmpty({ message: 'Adviser phone is required' })
  @Matches(/^(\+65\s?)?[689]\d{3}\s?\d{4}$/, {
    message: 'Phone number is not a valid Singapore number. Use: +65 9123 4567 or 9123 4567',
  })
  adviserPhone: string;

  @ApiProperty({ description: 'Client full name', example: 'John Tan' })
  @IsString({ message: 'Client name must be text (cannot be empty)' })
  @IsNotEmpty({ message: 'Client name is required' })
  @MaxLength(100, { message: 'Client name is too long (maximum 100 characters)' })
  client: string;

  @ApiProperty({ description: 'Policy name', example: 'Elite Whole Life' })
  @IsString({ message: 'Policy name must be text (cannot be empty)' })
  @IsNotEmpty({ message: 'Policy name is required' })
  @MaxLength(200, { message: 'Policy name is too long (maximum 200 characters)' })
  policy: string;

  @ApiProperty({ description: 'Renewal date', example: '2026-08-15' })
  @IsDateString({ strict: true }, { message: 'Date is not in a valid format. Use YYYY-MM-DD (e.g. 2026-08-15)' })
  renewalDate: string;

  @ApiPropertyOptional({ description: 'Premium amount in SGD', example: 2800 })
  @IsOptional()
  @IsNumber({}, { message: 'Premium must be a number (e.g. 2800, not "$2,800")' })
  @Min(0, { message: 'Premium cannot be negative' })
  premium?: number;
}
