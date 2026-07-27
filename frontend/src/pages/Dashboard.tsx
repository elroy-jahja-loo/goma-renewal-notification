import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import RenewalTable from '../components/RenewalTable';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';
import { getRenewals, processNow } from '../api/client';
import type { RenewalResponse } from '../api/client';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState<RenewalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('');
  const [adviser, setAdviser] = useState('');
  const [sortBy, setSortBy] = useState('renewalDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRenewals({ page, limit: 10, status: status || undefined, adviser: adviser || undefined, sortBy, sortOrder });
      setData(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch {
      toast.error('Failed to load renewals');
    } finally {
      setLoading(false);
    }
  }, [page, status, adviser, sortBy, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSendAll() {
    setSending(true);
    try {
      const res = await processNow();
      toast.success(res.message);
      fetchData();
    } catch {
      toast.error('Failed to send notifications');
    } finally {
      setSending(false);
    }
  }

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Renewals Dashboard</h1>
          <p className="mt-2 text-gray-500">View and track all policy renewal notifications</p>
        </div>
        <Button onClick={handleSendAll} disabled={sending} className="bg-indigo-600 hover:bg-indigo-700">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {sending ? 'Sending...' : 'Send All Pending'}
        </Button>
      </div>

      <FilterBar status={status} adviser={adviser} onStatusChange={(s) => { setStatus(s); setPage(1); }} onAdviserChange={(a) => { setAdviser(a); setPage(1); }} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Renewals</CardTitle>
        </CardHeader>
        <CardContent>
          <RenewalTable data={data} loading={loading} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
