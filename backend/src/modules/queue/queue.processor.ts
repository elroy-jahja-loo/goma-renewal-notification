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
    job: Job<any>,
  ): Promise<void> {
    if (job.name === 'daily-scan') {
      await this.handleDailyScan();
      return;
    }

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

    const { data: current } = await this.supabase
      .from('renewals')
      .select('status')
      .eq('id', renewalId)
      .single();

    if (current && current.status !== 'pending') {
      this.logger.info(
        { jobId: job.id, renewalId, currentStatus: current.status },
        'Skipping — renewal already processed',
      );
      return;
    }

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

  private async handleDailyScan(): Promise<void> {
    this.logger.info('Running scheduled scan for pending renewals within 30 days...');

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const cutoffDate = thirtyDaysFromNow.toISOString().split('T')[0];

    const { data: pendingRenewals, error } = await this.supabase
      .from('renewals')
      .select('id, client_name, policy_name, renewal_date, premium, adviser_name, adviser_phone')
      .eq('status', 'pending')
      .lte('renewal_date', cutoffDate)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error({ error }, 'Failed to fetch pending renewals for daily scan');
      return;
    }

    if (!pendingRenewals || pendingRenewals.length === 0) {
      this.logger.info('No pending renewals to process in daily scan');
      return;
    }

    this.logger.info({ count: pendingRenewals.length }, 'Daily scan found pending renewals');

    const { Queue } = require('bullmq');
    const queue = new Queue('renewal-notifications', {
      connection: { url: process.env.REDIS_URL },
    });

    for (const r of pendingRenewals) {
      await queue.add(
        'process-renewal',
        {
          renewalId: r.id,
          clientName: r.client_name,
          policyName: r.policy_name,
          renewalDate: r.renewal_date,
          premium: r.premium,
          adviserName: r.adviser_name,
          adviserPhone: r.adviser_phone,
        },
        {
          delay: 5000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
        },
      );
    }

    await queue.close();
    this.logger.info({ count: pendingRenewals.length }, 'Daily scan enqueued pending renewals');
  }
}
