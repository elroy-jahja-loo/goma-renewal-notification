import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RenewalRepository } from './repositories/renewal.repository';
import { RenewalFilterDto } from './dto/renewal-filter.dto';
import { RenewalPaginatedResponse } from './dto/renewal-response.dto';

@Injectable()
export class RenewalService {
  constructor(
    private readonly renewalRepository: RenewalRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RenewalService.name);
  }

  async getRenewals(filters: RenewalFilterDto): Promise<RenewalPaginatedResponse> {
    this.logger.info({ filters }, 'Fetching renewals');
    return this.renewalRepository.findAll(filters);
  }

  async getErrorReport(batchId: string): Promise<Record<string, unknown>[]> {
    this.logger.info({ batchId }, 'Fetching error report');
    return this.renewalRepository.getErrorReport(batchId);
  }
}
