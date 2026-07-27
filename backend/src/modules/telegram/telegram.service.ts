import { Injectable, Inject } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseClient } from '@supabase/supabase-js';

export interface TelegramStatus {
  connected: boolean;
  chatId?: string;
  instructions?: string;
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly logger: PinoLogger,
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {
    this.logger.setContext(TelegramService.name);
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        },
      );

      if (!res.ok) {
        this.logger.error(
          { status: res.status, statusText: res.statusText },
          'Telegram sendMessage failed',
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(error, 'Telegram sendMessage exception');
      return false;
    }
  }

  async detectChatId(): Promise<string | null> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`,
      );

      if (!res.ok) {
        this.logger.error(
          { status: res.status },
          'Telegram getUpdates failed',
        );
        return null;
      }

      const data = await res.json();
      const results: Array<{ message?: { chat: { id: number } } }> =
        data.result;

      if (!results || results.length === 0) {
        this.logger.warn('No updates found from Telegram');
        return null;
      }

      const mostRecent = results[results.length - 1];
      const chatId = mostRecent?.message?.chat?.id?.toString();

      if (!chatId) {
        this.logger.warn('No chat ID found in most recent update');
        return null;
      }

      await this.supabase.from('bot_config').upsert(
        {
          id: 1,
          chat_id: chatId,
          is_connected: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

      this.logger.info({ chatId }, 'Telegram chat ID detected and saved');
      return chatId;
    } catch (error) {
      this.logger.error(error, 'detectChatId exception');
      return null;
    }
  }

  async getStatus(): Promise<TelegramStatus> {
    try {
      const { data, error } = await this.supabase
        .from('bot_config')
        .select('chat_id, is_connected')
        .eq('id', 1)
        .single();

      if (error || !data) {
        return {
          connected: false,
          instructions:
            'Open @GomaRenewalsBot on Telegram and click Start.',
        };
      }

      if (data.is_connected && data.chat_id) {
        return { connected: true, chatId: data.chat_id };
      }

      return {
        connected: false,
        instructions:
          'Open @GomaRenewalsBot on Telegram and click Start.',
      };
    } catch (error) {
      this.logger.error(error, 'getStatus exception');
      return {
        connected: false,
        instructions: 'Open @GomaRenewalsBot on Telegram and click Start.',
      };
    }
  }
}
