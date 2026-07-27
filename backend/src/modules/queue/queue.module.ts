import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { RenewalProcessor } from './queue.processor';
import { RateLimiterService } from './rate-limiter.service';
import { AiModule } from '../ai/ai.module';
import { TelegramModule } from '../telegram/telegram.module';
import { supabase } from '../../database/supabase';

@Module({
  imports: [AiModule, TelegramModule],
  providers: [
    QueueService,
    RenewalProcessor,
    RateLimiterService,
    {
      provide: 'SUPABASE_CLIENT',
      useValue: supabase,
    },
  ],
  exports: [QueueService],
})
export class QueueModule {}
