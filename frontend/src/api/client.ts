import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({ baseURL: API_URL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('goma_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('goma_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

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

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number; };
}

export interface UploadResult {
  batchId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errorReportUrl: string;
}

export interface BotStatus {
  connected: boolean;
  chatId?: string;
  instructions?: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<UploadResult>('/renewals/upload', form);
  return data;
}

export async function getRenewals(params: Record<string, string | number | undefined>): Promise<PaginatedResponse<RenewalResponse>> {
  const { data } = await api.get('/renewals', { params });
  return data;
}

export async function downloadErrors(batchId: string): Promise<Blob> {
  const { data } = await api.get(`/renewals/errors/${batchId}`, { responseType: 'blob' });
  return data;
}

export async function getBotStatus(): Promise<BotStatus> {
  const { data } = await api.get('/telegram/status');
  return data;
}

export async function connectBot(): Promise<BotStatus> {
  const { data } = await api.post('/telegram/connect');
  return data;
}

export async function processNow(): Promise<{ processed: number; message: string }> {
  const { data } = await api.post('/renewals/process');
  return data;
}
