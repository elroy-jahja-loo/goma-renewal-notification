import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Worker, Job } from 'bullmq';
import { SupabaseClient } from '@supabase/supabase-js';
import { AiService } from '../ai/ai.service';
import { TelegramService } from '../telegram/telegram.service';
import { RateLimiterService } from './rate-limiter.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class RenewalProcessor implements OnModuleInit, OnModuleDestroy {
  private worker!: Worker;

  constructor(
    private readonly aiService: AiService,
    private readonly telegramService: TelegramService,
    private readonly rateLimiter: RateLimiterService,
    private readonly logger: PinoLogger,
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {
    this.logger.setContext(RenewalProcessor.name);
  }

  onModuleInit(): void {
    this.worker = new Worker(
      'renewal-notifications',
      this.processJob.bind(this),
      {
        connection: {
          url: process.env.REDIS_URL,
        },
        concurrency: 5,
      },
    );

    this.logger.info('RenewalProcessor Worker initialized');
  }

  private async processJob(
    job: Job<{
      renewalId: string;
      clientName: string;
      policyName: string;
      renewalDate: string;
      premium: number | null;
      adviserName: string;
      adviserPhone: string;
    }>,
  ): Promise<void> {
    const {
      renewalId,
      clientName,
      policyName,
      renewalDate,
      premium,
      adviserName,
      adviserPhone,
    } = job.data;

    this.logger.info(
      { jobId: job.id, renewalId, clientName },
      'Processing renewal job',
    );

    await this.supabase
      .from('renewals')
      .update({ status: 'processing' })
      .eq('id', renewalId);

    while (!this.rateLimiter.tryConsume()) {
      await sleep(100);
    }

    const aiMessage = await this.aiService.generateMessage({
      adviserName,
      clientName,
      policyName,
      renewalDate,
      premium,
    });

    const { data: botConfig, error: botError } = await this.supabase
      .from('bot_config')
      .select('chat_id')
      .eq('id', 1)
      .single();

    if (botError || !botConfig?.chat_id) {
      await this.supabase
        .from('renewals')
        .update({
          status: 'failed',
          last_error: 'No Telegram chat ID configured',
        })
        .eq('id', renewalId);

      throw new Error('No Telegram chat ID configured');
    }

    const chatId = botConfig.chat_id;
    const success = await this.telegramService.sendMessage(chatId, aiMessage);

    if (success) {
      await this.supabase
        .from('renewals')
        .update({
          status: 'sent',
          ai_message: aiMessage,
          sent_at: new Date().toISOString(),
        })
        .eq('id', renewalId);

      this.logger.info(
        { jobId: job.id, renewalId, chatId },
        'Renewal notification sent successfully',
      );
    } else {
      const attemptsMade = (job.attemptsMade || 0) + 1;

      await this.supabase
        .from('renewals')
        .update({
          status: 'failed',
          last_error: 'Telegram sendMessage returned false',
          retry_count: attemptsMade,
        })
        .eq('id', renewalId);

      this.logger.warn(
        { jobId: job.id, renewalId, attemptsMade },
        'Renewal notification failed to send',
      );

      throw new Error('Telegram sendMessage failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    this.logger.info('RenewalProcessor Worker closed');
  }
}
