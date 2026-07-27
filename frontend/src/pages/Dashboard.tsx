import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import RenewalTable from '../components/RenewalTable';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';
import { getRenewals } from '../api/client';
import type { RenewalResponse } from '../api/client';
import { toast } from 'sonner';

export default function Dashboard() {
  const [data, setData] = useState<RenewalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('');
  const [adviser, setAdviser] = useState('');
  const [sortBy, setSortBy] = useState('renewalDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Renewals Dashboard</h1>
        <p className="mt-2 text-gray-500">View and track all policy renewal notifications</p>
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
