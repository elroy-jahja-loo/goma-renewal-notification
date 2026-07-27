export interface RenewalResponse {
  id: string;
  clientName: string;
  policyName: string;
  renewalDate: string;
  premium: number | null;
  adviserName: string;
  adviserPhone: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  sentAt: string | null;
  createdAt: string;
  lastError: string | null;
  retryCount: number;
}

export interface RenewalPaginatedResponse {
  data: RenewalResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
