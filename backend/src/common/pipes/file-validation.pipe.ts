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
      throw new BadRequestException('No file was selected. Please choose a .xlsx or .csv file to upload.');
    }

    if (file.size > this.maxSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      throw new BadRequestException(
        `File is too large (${sizeMB} MB). Maximum file size is 10 MB.`,
      );
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      throw new BadRequestException(
        `"${file.originalname}" is not a supported file type. Please upload a .xlsx, .xls, or .csv file.`,
      );
    }

    return file;
  }
}
