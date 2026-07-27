import type { RenewalResponse } from '../api/client';
import StatusBadge from './StatusBadge';
import { Skeleton } from './ui/skeleton';
import { ArrowUpDown } from 'lucide-react';

interface Props {
  data: RenewalResponse[];
  loading: boolean;
  sortBy: string;
  sortOrder: string;
  onSort: (field: string) => void;
}

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'clientName', label: 'Client', sortable: true },
  { key: 'policyName', label: 'Policy', sortable: true },
  { key: 'renewalDate', label: 'Renewal Date', sortable: true },
  { key: 'premium', label: 'Premium', sortable: true },
  { key: 'adviserName', label: 'Adviser', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'sentAt', label: 'Sent At', sortable: true },
];

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-SG', { dateStyle: 'medium' });
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' });
}

export default function RenewalTable({ data, loading, sortBy: _sortBy, sortOrder: _sortOrder, onSort }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-lg font-medium">No renewals found</p>
        <p className="text-sm">Upload a file to see renewals here</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-medium text-gray-600 ${col.sortable ? 'cursor-pointer hover:text-gray-900 select-none' : ''}`}
                onClick={() => col.sortable && onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{row.clientName}</td>
              <td className="px-4 py-3 text-gray-700">{row.policyName}</td>
              <td className="px-4 py-3 text-gray-700">{formatDate(row.renewalDate)}</td>
              <td className="px-4 py-3 text-gray-700">
                {row.premium != null ? `S$${row.premium.toLocaleString()}` : '—'}
              </td>
              <td className="px-4 py-3 text-gray-700">{row.adviserName}</td>
              <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-3 text-gray-500">{formatDateTime(row.sentAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
