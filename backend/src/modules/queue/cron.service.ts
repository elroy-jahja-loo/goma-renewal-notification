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

  onModuleInit(): void {
    setImmediate(async () => {
      try {
        const queue = this.queueService.getQueue();
        await queue.add(
          'daily-scan',
          {},
          {
            repeat: { pattern: '*/5 * * * *' },
            jobId: 'hourly-renewal-scan',
            removeOnComplete: true,
          },
        );
        this.pinoLogger.info('Cron registered: */5 * * * * (every 5 minutes)');
      } catch (err) {
        this.pinoLogger.warn({ err }, 'Failed to register hourly cron — will retry on next deploy');
      }
    });
  }

  async runDailyScan(): Promise<{ processed: number }> {
    this.logger.log('Running hourly scan for pending renewals within 30 days...');

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

    this.pinoLogger.info({ count: pendingRenewals.length }, 'Hourly scan enqueued renewals');
    return { processed: pendingRenewals.length };
  }
}
