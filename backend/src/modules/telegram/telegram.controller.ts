import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TelegramService, TelegramStatus } from './telegram.service';

@ApiTags('Telegram')
@Controller('api/telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Telegram bot connection status' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current Telegram connection status',
  })
  async getStatus(): Promise<TelegramStatus> {
    return this.telegramService.getStatus();
  }

  @Post('connect')
  @ApiOperation({ summary: 'Detect and connect to a Telegram chat' })
  @ApiResponse({
    status: 201,
    description: 'Telegram chat detected and connected successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'No Telegram chat found to connect',
  })
  async connect(): Promise<TelegramStatus> {
    const chatId = await this.telegramService.detectChatId();

    if (!chatId) {
      return {
        connected: false,
        instructions:
          'No messages found. Open @GomaRenewalsBot on Telegram and click Start, then try again.',
      };
    }

    return { connected: true, chatId };
  }
}
