import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Queue } from 'bullmq';

interface RenewalJobData {
  id: string;
  clientName: string;
  policyName: string;
  renewalDate: string;
  premium: number | null;
  adviserName: string;
  adviserPhone: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private queue: Queue;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(QueueService.name);

    this.queue = new Queue('renewal-notifications', {
      connection: {
        url: process.env.REDIS_URL,
      },
    });

    this.logger.info('BullMQ Queue initialized');
  }

  async addJobs(renewals: RenewalJobData[]): Promise<void> {
    for (const renewal of renewals) {
      await this.queue.add(
        'process-renewal',
        {
          renewalId: renewal.id,
          clientName: renewal.clientName,
          policyName: renewal.policyName,
          renewalDate: renewal.renewalDate,
          premium: renewal.premium,
          adviserName: renewal.adviserName,
          adviserPhone: renewal.adviserPhone,
        },
        {
          delay: 5000,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000,
          },
        },
      );

      this.logger.info(
        { renewalId: renewal.id, clientName: renewal.clientName },
        'Job added to queue',
      );
    }
  }

  getQueue(): Queue {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.logger.info('BullMQ Queue connection closed');
  }
}
