import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseClient } from '@supabase/supabase-js';
import { QueueService } from './queue.service';

@Injectable()
export class CronService implements OnModuleInit {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly queueService: QueueService,
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    private readonly pinoLogger: PinoLogger,
  ) {
    this.pinoLogger.setContext(CronService.name);
  }

  async onModuleInit(): Promise<void> {
    const queue = this.queueService.getQueue();

    await queue.add(
      'daily-scan',
      {},
      {
        repeat: {
          pattern: '0 * * * *',
        },
        jobId: 'hourly-renewal-scan',
        removeOnComplete: true,
      },
    );

    this.pinoLogger.info('Hourly cron registered: 0 * * * * (every hour on the hour UTC)');
  }

  async runDailyScan(): Promise<{ processed: number }> {
    this.logger.log('Running daily renewal scan...');

    const { data: pendingRenewals, error } = await this.supabase
      .from('renewals')
      .select('id, client_name, policy_name, renewal_date, premium, adviser_name, adviser_phone')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      this.pinoLogger.error({ error }, 'Failed to fetch pending renewals for daily scan');
      return { processed: 0 };
    }

    if (!pendingRenewals || pendingRenewals.length === 0) {
      this.logger.log('No pending renewals to process');
      return { processed: 0 };
    }

    this.logger.log(`Found ${pendingRenewals.length} pending renewals, enqueuing...`);

    await this.queueService.addJobs(
      pendingRenewals.map((r: any) => ({
        id: r.id,
        clientName: r.client_name,
        policyName: r.policy_name,
        renewalDate: r.renewal_date,
        premium: r.premium,
        adviserName: r.adviser_name,
        adviserPhone: r.adviser_phone,
      })),
    );

    this.pinoLogger.info({ count: pendingRenewals.length }, 'Daily scan enqueued renewals');
    return { processed: pendingRenewals.length };
  }
}
