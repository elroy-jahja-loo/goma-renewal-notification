import { Badge } from './ui/badge';

const STATUS_MAP: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  processing: 'info',
  sent: 'success',
  failed: 'error',
};

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  return <Badge variant={STATUS_MAP[status] || 'default'}>{status}</Badge>;
}
