import { Module } from '@nestjs/common';
import { RenewalService } from './renewal.service';
import { RenewalController } from './renewal.controller';
import { RenewalRepository } from './repositories/renewal.repository';
import { supabase } from '../../database/supabase';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [LoggerModule],
  controllers: [RenewalController],
  providers: [
    RenewalService,
    RenewalRepository,
    {
      provide: 'SUPABASE_CLIENT',
      useValue: supabase,
    },
  ],
  exports: [RenewalService, RenewalRepository],
})
export class RenewalModule {}
