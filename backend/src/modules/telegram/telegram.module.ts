import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { supabase } from '../../database/supabase';

@Module({
  providers: [
    TelegramService,
    {
      provide: 'SUPABASE_CLIENT',
      useValue: supabase,
    },
  ],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
