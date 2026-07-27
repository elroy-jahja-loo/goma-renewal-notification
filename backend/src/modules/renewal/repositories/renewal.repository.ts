import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RenewalFilterDto } from '../dto/renewal-filter.dto';
import { RenewalResponse, RenewalPaginatedResponse } from '../dto/renewal-response.dto';

const SNAKE_TO_CAMEL: Record<string, string> = {
  client_name: 'clientName',
  policy_name: 'policyName',
  renewal_date: 'renewalDate',
  adviser_name: 'adviserName',
  adviser_phone: 'adviserPhone',
  sent_at: 'sentAt',
  created_at: 'createdAt',
  last_error: 'lastError',
  retry_count: 'retryCount',
};

const COLUMN_MAP: Record<string, string> = {
  clientName: 'client_name',
  policyName: 'policy_name',
  renewalDate: 'renewal_date',
  premium: 'premium',
  adviserName: 'adviser_name',
  status: 'status',
  sentAt: 'sent_at',
  createdAt: 'created_at',
};

function mapRow(row: Record<string, unknown>): RenewalResponse {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = SNAKE_TO_CAMEL[key] ?? key;
    mapped[camelKey] = value;
  }
  return mapped as unknown as RenewalResponse;
}

@Injectable()
export class RenewalRepository {
  constructor(@Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient) {}

  async findAll(filters: RenewalFilterDto): Promise<RenewalPaginatedResponse> {
    const { page = 1, limit = 10, status, adviser, sortBy = 'createdAt', sortOrder = 'desc' } = filters;

    let query = this.supabase.from('renewals').select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (adviser) {
      query = query.ilike('adviser_name', `%${adviser}%`);
    }

    const dbColumn = COLUMN_MAP[sortBy] ?? 'created_at';
    const ascending = sortOrder === 'asc';

    query = query.order(dbColumn, { ascending });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    const total = count ?? 0;

    return {
      data: (data ?? []).map(mapRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const payload: Record<string, unknown> = { status, ...extra };
    const { error } = await this.supabase.from('renewals').update(payload).eq('id', id);

    if (error) {
      throw error;
    }
  }

  async findPending(limit?: number): Promise<RenewalResponse[]> {
    let query = this.supabase
      .from('renewals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapRow);
  }

  async getErrorReport(batchId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from('failed_renewals')
      .select('*')
      .eq('upload_batch', batchId);

    if (error) {
      throw error;
    }

    return (data ?? []) as Record<string, unknown>[];
  }
}
