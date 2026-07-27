import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'text/x-csv',
    'application/x-csv',
  ];

  private readonly maxSize = 10 * 1024 * 1024;

  transform(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException(
        `File size exceeds the maximum allowed size of 10MB`,
      );
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      throw new BadRequestException(
        'Invalid file type. Only .xlsx, .xls, and .csv files are allowed',
      );
    }

    return file;
  }
}
