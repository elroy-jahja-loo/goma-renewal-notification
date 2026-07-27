import { useEffect, useState } from 'react';
import { Select } from './ui/select';
import { Input } from './ui/input';
import { Search } from 'lucide-react';

interface Props {
  status: string;
  adviser: string;
  onStatusChange: (s: string) => void;
  onAdviserChange: (s: string) => void;
}

export default function FilterBar({ status, adviser, onStatusChange, onAdviserChange }: Props) {
  const [localAdviser, setLocalAdviser] = useState(adviser);

  useEffect(() => {
    const timer = setTimeout(() => onAdviserChange(localAdviser), 300);
    return () => clearTimeout(timer);
  }, [localAdviser, onAdviserChange]);

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={status} onChange={(e) => onStatusChange(e.target.value)} className="w-40">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="sent">Sent</option>
        <option value="failed">Failed</option>
      </Select>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search adviser..."
          value={localAdviser}
          onChange={(e) => setLocalAdviser(e.target.value)}
          className="pl-9 w-56"
        />
      </div>
    </div>
  );
}
