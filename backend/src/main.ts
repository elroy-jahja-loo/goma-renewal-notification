import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { supabase } from './database/supabase';

async function runMigrations(): Promise<void> {
  const logger = new Logger('Migrations');
  try {
    const { error: tableCheck } = await supabase
      .from('renewals')
      .select('id')
      .limit(1);

    if (tableCheck) {
      logger.warn('Tables may not exist. Database migrations should be applied via Supabase MCP.');
      logger.warn('Error checking renewals table:', tableCheck.message);
    } else {
      logger.log('Database tables verified successfully');
    }
  } catch (err) {
    logger.error('Failed to verify database tables', err);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Goma AI — Renewal Notifications')
    .setDescription(
      'API for uploading policy renewal spreadsheets, generating AI reminders, and sending Telegram notifications to financial advisers.',
    )
    .setVersion('1.0')
    .addTag('Renewals', 'Endpoints for managing policy renewals')
    .addTag('Upload', 'Upload and validate Excel/CSV files')
    .addTag('Telegram', 'Bot connection and notification delivery')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await runMigrations();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
