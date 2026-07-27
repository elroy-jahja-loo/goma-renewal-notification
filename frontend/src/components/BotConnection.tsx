import { useState, useEffect } from 'react';
import { getBotStatus, connectBot } from '../api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BotConnection({ onConnected }: { onConnected: () => void }) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [chatId, setChatId] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const res = await getBotStatus();
      if (res.connected) {
        setStatus('connected');
        setChatId(res.chatId || '');
        onConnected();
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await connectBot();
      if (res.connected) {
        setStatus('connected');
        setChatId(res.chatId || '');
        onConnected();
        toast.success('Bot connected successfully!');
      } else {
        toast.error(res.instructions || 'Failed to connect. Make sure you clicked Start on the bot.');
      }
    } catch {
      toast.error('Connection failed. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  if (status === 'loading') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Checking bot status...</span>
        </CardContent>
      </Card>
    );
  }

  if (status === 'connected') {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span className="text-emerald-800 font-medium">Bot Connected</span>
          <Badge variant="success">{chatId}</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          Connect Telegram Bot
        </CardTitle>
        <CardDescription>
          1. Open <strong>@GomaRenewalsBot</strong> on Telegram<br />
          2. Click <strong>Start</strong><br />
          3. Then click the button below
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleConnect} disabled={connecting} className="w-full">
          {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {connecting ? 'Connecting...' : 'Connect Telegram'}
        </Button>
      </CardContent>
    </Card>
  );
}
