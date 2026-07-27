import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import * as Joi from 'joi';

import { appConfig } from './config/app.config';
import { supabaseConfig } from './config/supabase.config';
import { openaiConfig } from './config/openai.config';
import { redisConfig } from './config/redis.config';
import { telegramConfig } from './config/telegram.config';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimingInterceptor } from './common/interceptors/timing.interceptor';

import { RenewalModule } from './modules/renewal/renewal.module';
import { UploadModule } from './modules/upload/upload.module';
import { AiModule } from './modules/ai/ai.module';
import { QueueModule } from './modules/queue/queue.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, supabaseConfig, openaiConfig, redisConfig, telegramConfig],
      validationSchema: Joi.object({
        SUPABASE_URL: Joi.string().uri().required(),
        SUPABASE_SERVICE_KEY: Joi.string().required(),
        OPENAI_API_KEY: Joi.string().required(),
        REDIS_URL: Joi.string().uri().required(),
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
        CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      },
    }),
    RenewalModule,
    UploadModule,
    AiModule,
    QueueModule,
    TelegramModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
        }),
    },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimingInterceptor },
  ],
})
export class AppModule {}
