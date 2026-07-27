import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ExcelParserService } from './parsers/excel-parser.service';
import { QueueModule } from '../queue/queue.module';
import { supabase } from '../../database/supabase';

@Module({
  imports: [QueueModule],
  controllers: [UploadController],
  providers: [
    UploadService,
    ExcelParserService,
    {
      provide: 'SUPABASE_CLIENT',
      useValue: supabase,
    },
  ],
  exports: [UploadService, ExcelParserService],
})
export class UploadModule {}
