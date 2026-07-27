import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import FileDropZone from '../components/FileDropZone';
import ValidationResults from '../components/ValidationResults';
import BotConnection from '../components/BotConnection';
import { uploadFile } from '../api/client';
import type { UploadResult } from '../api/client';
import { toast } from 'sonner';

export default function Upload() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [botReady, setBotReady] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const res = await uploadFile(file);
      setResult(res);
      toast.success(`${res.validRows} renewals processed successfully!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Policy Renewal Notifications</h1>
        <p className="mt-2 text-gray-500">Upload your monthly renewal spreadsheet to notify advisers automatically</p>
      </div>

      <BotConnection onConnected={() => setBotReady(true)} onDisconnected={() => setBotReady(false)} />

      <Card>
        <CardHeader>
          <CardTitle>Upload Renewals</CardTitle>
          <CardDescription>Accepted formats: .xlsx, .xls, .csv (max 10MB)</CardDescription>
        </CardHeader>
        <CardContent>
          {!botReady ? (
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              Please connect the Telegram bot above before uploading.
            </div>
          ) : (
            <FileDropZone onFile={handleFile} uploading={uploading} />
          )}
        </CardContent>
      </Card>

      {result && <ValidationResults result={result} />}
    </div>
  );
}
