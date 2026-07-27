import { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle2, XCircle, Download, Bell, Send, Loader2 } from 'lucide-react';
import type { UploadResult } from '../api/client';
import { downloadErrors, processNow } from '../api/client';
import { toast } from 'sonner';

interface Props {
  result: UploadResult;
}

export default function ValidationResults({ result }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleDownload() {
    try {
      const blob = await downloadErrors(result.batchId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `error-report-${result.batchId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download error report');
    }
  }

  async function handleSendNow() {
    setSending(true);
    try {
      const res = await processNow();
      setSent(true);
      toast.success(res.message);
    } catch {
      toast.error('Failed to send notifications');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold text-emerald-700">{result.validRows}</p>
              <p className="text-sm text-emerald-600">Valid rows</p>
            </div>
          </CardContent>
        </Card>
        <Card className={result.invalidRows > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}>
          <CardContent className="flex items-center gap-3 py-4">
            {result.invalidRows > 0 ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-gray-400" />
            )}
            <div>
              <p className={`text-2xl font-bold ${result.invalidRows > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                {result.invalidRows}
              </p>
              <p className={`text-sm ${result.invalidRows > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                Invalid rows
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {result.invalidRows > 0 && (
        <Button variant="outline" onClick={handleDownload} className="w-full">
          <Download className="mr-2 h-4 w-4" />
          Download Error Report
        </Button>
      )}

      {result.validRows > 0 && !sent && (
        <Button onClick={handleSendNow} disabled={sending} className="w-full bg-indigo-600 hover:bg-indigo-700">
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {sending ? 'Sending...' : 'Send Notifications Now'}
        </Button>
      )}

      {sent && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-4 py-3">
          <Bell className="h-5 w-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">
            Notifications sent! Check Telegram for {result.validRows} messages.
          </p>
        </div>
      )}

      {!sent && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-indigo-50 px-4 py-3">
          <Bell className="h-5 w-5 text-indigo-600" />
          <p className="text-sm font-medium text-indigo-700">
            {result.validRows} renewals stored. Click "Send Now" to notify advisers, or they'll be sent hourly.
          </p>
        </div>
      )}
    </div>
  );
}
