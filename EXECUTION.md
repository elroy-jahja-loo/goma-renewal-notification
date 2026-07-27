# Goma AI — Execution Commands

> **How to use this file:** Each phase below has a message you copy-paste into this chat. Run them in order. Wait for each phase to complete before starting the next. Within a phase with parallel agents, paste all agent commands at once in a single message with multiple Task tool calls.

---

## Phase 1 — Foundation (Single Agent: You/Orchestrator)

Copy-paste this entire message into chat:

```
Phase 1 — Foundation. Do all of these in order:

1. SCAFFOLD: Create a NestJS backend project at backend/ using:
   - nest new backend --skip-git --package-manager pnpm
   - Use pnpm throughout, not npm
   - Remove any generated .git/ folder

2. DEPS: Install these packages in backend/:
   - @nestjs/config @nestjs/swagger @nestjs/platform-express @nestjs/serve-static
   - @supabase/supabase-js
   - openai
   - bullmq ioredis
   - xlsx csv-parse
   - multer
   - class-validator class-transformer
   - pino pino-pretty nestjs-pino
   - Dev: @types/multer @types/node

3. ENV CONFIG: Create these files:
   - backend/src/config/supabase.config.ts (registerAs, reads SUPABASE_URL + SUPABASE_SERVICE_KEY, validates with Joi)
   - backend/src/config/openai.config.ts (reads OPENAI_API_KEY)
   - backend/src/config/redis.config.ts (reads REDIS_URL)
   - backend/src/config/telegram.config.ts (reads TELEGRAM_BOT_TOKEN)
   - backend/src/config/app.config.ts (reads NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGIN)
   Use @nestjs/config with ConfigModule.forRoot({ isGlobal: true, validationSchema, load: [...] })

4. DATABASE: Using Supabase MCP (supabase_apply_migration), create these tables:
   - renewals (id UUID PK, client_name text, policy_name text, renewal_date date, premium decimal(12,2), adviser_name text, adviser_phone text, status text CHECK pending|processing|sent|failed, ai_message text, sent_at timestamptz, created_at timestamptz, upload_batch UUID, retry_count int, last_error text, hash text UNIQUE)
   - upload_batches (id UUID PK, filename text, total_rows int, valid_rows int, invalid_rows int, created_at timestamptz)
   - failed_renewals (id UUID PK, upload_batch UUID FK→upload_batches, row_number int, raw_data jsonb, errors text[], created_at timestamptz)
   - bot_config (id int PK CHECK id=1, chat_id text, is_connected bool DEFAULT false, updated_at timestamptz)
   Add indexes: renewals(status), renewals(adviser_name), renewals(renewal_date), renewals(hash) UNIQUE

5. SUPABASE CLIENT: Create backend/src/database/supabase.ts — a singleton that creates and exports a SupabaseClient using SUPABASE_URL + SUPABASE_SERVICE_KEY from env.

6. COMMON MODULE: Create backend/src/common/ with:
   - filters/http-exception.filter.ts (NestJS ExceptionFilter, catches all exceptions, returns { statusCode, message, timestamp, path })
   - interceptors/logging.interceptor.ts (logs method + url + duration + status using Pino)
   - interceptors/timing.interceptor.ts (adds X-Response-Time header)
   - pipes/file-validation.pipe.ts (validates multer file exists, is XLSX/CSV, max 10MB)
   - dto/pagination.dto.ts (page, limit with @IsOptional, @IsInt, @Min, @Max decorators)
   - dto/api-response.dto.ts (generic ApiResponse<T> with data, message)

7. DTOs — THE CONTRACTS: Create all DTOs that agents will implement against:

   backend/src/modules/renewal/dto/renewal-row.dto.ts:
   ```typescript
   import { IsString, IsDateString, IsNumber, IsOptional, Min, MaxLength, Matches } from 'class-validator';

   export class RenewalRowDto {
     @IsString()
     @MaxLength(100)
     adviser: string;

     @IsString()
     @Matches(/^(\+65\s?)?[689]\d{3}\s?\d{4}$/, { message: 'Invalid SG phone number' })
     adviserPhone: string;

     @IsString()
     @MaxLength(100)
     client: string;

     @IsString()
     @MaxLength(200)
     policy: string;

     @IsDateString()
     renewalDate: string;

     @IsOptional()
     @IsNumber()
     @Min(0)
     premium?: number;
   }
   ```

   backend/src/modules/renewal/dto/renewal-filter.dto.ts:
   ```typescript
   import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
   import { Type } from 'class-transformer';

   export enum RenewalStatus {
     PENDING = 'pending',
     PROCESSING = 'processing',
     SENT = 'sent',
     FAILED = 'failed',
   }

   export enum SortField {
     CLIENT_NAME = 'clientName',
     POLICY_NAME = 'policyName',
     RENEWAL_DATE = 'renewalDate',
     PREMIUM = 'premium',
     ADVISER_NAME = 'adviserName',
     STATUS = 'status',
     SENT_AT = 'sentAt',
     CREATED_AT = 'createdAt',
   }

   export class RenewalFilterDto {
     @IsOptional()
     @Type(() => Number)
     @IsInt()
     @Min(1)
     page?: number = 1;

     @IsOptional()
     @Type(() => Number)
     @IsInt()
     @Min(1)
     @Max(100)
     limit?: number = 10;

     @IsOptional()
     @IsEnum(RenewalStatus)
     status?: RenewalStatus;

     @IsOptional()
     @IsString()
     adviser?: string;

     @IsOptional()
     @IsEnum(SortField)
     sortBy?: SortField = SortField.RENEWAL_DATE;

     @IsOptional()
     @IsEnum(['asc', 'desc'])
     sortOrder?: 'asc' | 'desc' = 'asc';
   }
   ```

   backend/src/modules/renewal/dto/renewal-response.dto.ts:
   ```typescript
   export interface RenewalResponse {
     id: string;
     clientName: string;
     policyName: string;
     renewalDate: string;
     premium: number | null;
     adviserName: string;
     adviserPhone: string;
     status: 'pending' | 'processing' | 'sent' | 'failed';
     sentAt: string | null;
     createdAt: string;
     lastError: string | null;
     retryCount: number;
   }

   export interface RenewalPaginatedResponse {
     data: RenewalResponse[];
     pagination: {
       page: number;
       limit: number;
       total: number;
       totalPages: number;
     };
   }
   ```

   backend/src/modules/upload/dto/upload-response.dto.ts:
   ```typescript
   export interface UploadResponse {
     batchId: string;
     filename: string;
     totalRows: number;
     validRows: number;
     invalidRows: number;
     errorReportUrl: string;
   }
   ```

   backend/src/modules/telegram/dto/send-message.dto.ts:
   ```typescript
   export interface TelegramStatus {
     connected: boolean;
     chatId?: string;
     instructions?: string;
   }
   ```

8. APP MODULE SHELL: Create backend/src/app.module.ts. Import ConfigModule (global), all feature modules (commented out for now), common providers. Do NOT wire feature modules yet — just have stubs.

9. Verify: pnpm run build in backend/ must pass with zero errors. All DTOs and config files must compile.

Return: list of all files created and confirmation that `pnpm run build` passes.
```

---

## Phase 2 — Parallel Backend Modules (3 Agents)

**Paste all 3 agent commands at once in a single message** (use 3 Task tool calls with subagent_type: "general").

### Agent A — Upload Module

```
Agent A — Upload Module. Create these files. Do NOT read any existing files — I'll provide all context inline.

PROJECT: NestJS backend at backend/src/. The project uses:
- Supabase JS client from database/supabase.ts (import { supabase } from '../../database/supabase')
- Pino logger (import { InjectPinoLogger, PinoLogger } from 'nestjs-pino')
- class-validator DTOs for validation

YOUR TASK: Create the upload module — upload.controller.ts, upload.service.ts, parsers/excel-parser.service.ts, upload.module.ts

THE CONTRACT (already exists — do NOT recreate, just import):

import { IsString, IsDateString, IsNumber, IsOptional, Min, MaxLength, Matches } from 'class-validator';
export class RenewalRowDto {
  @IsString() @MaxLength(100) adviser: string;
  @IsString() @Matches(/^(\+65\s?)?[689]\d{3}\s?\d{4}$/, { message: 'Invalid SG phone number' }) adviserPhone: string;
  @IsString() @MaxLength(100) client: string;
  @IsString() @MaxLength(200) policy: string;
  @IsString() renewalDate: string;
  @IsOptional() @IsNumber() @Min(0) premium?: number;
}
// Export from: ../../renewal/dto/renewal-row.dto (already exists)

export interface UploadResponse { batchId: string; filename: string; totalRows: number; validRows: number; invalidRows: number; errorReportUrl: string; }
// Already at: ./dto/upload-response.dto

FILES TO CREATE:

1. backend/src/modules/upload/parsers/excel-parser.service.ts:
   - Class ExcelParserService (@Injectable)
   - parseFile(fileBuffer: Buffer, filename: string, originalname: string): ParsedRow[]
     - If .xlsx: use xlsx.read(buffer) → get first sheet → sheet_to_json({ header: 1 }) → first row as headers → map remaining rows to objects
     - If .csv: use csv-parse (sync parse) → same header mapping
     - Return array of { rowNumber: number, data: Record<string, string> }
   - Map headers case-insensitively: "Adviser"/"adviser"/"ADVISER" → adviser, "Adviser Phone"/"adviser phone" → adviserPhone, "Client"/"client" → client, "Policy"/"policy" → policy, "Renewal Date"/"renewal date" → renewalDate, "Premium"/"premium" → premium
   - ParsedRow interface: { rowNumber: number; data: { adviser?: string; adviserPhone?: string; client?: string; policy?: string; renewalDate?: string; premium?: string } }

2. backend/src/modules/upload/upload.service.ts:
   - Class UploadService (@Injectable)
   - Inject: SupabaseClient (use custom provider token 'SUPABASE_CLIENT' — define in module), ExcelParserService, InjectPinoLogger
   - async processUpload(fileBuffer: Buffer, filename: string, originalname: string): Promise<UploadResponse>
     Steps:
     a) Parse file via ExcelParserService → get rows
     b) For each row, validate using plainToInstance(RenewalRowDto, row.data) → validate() 
        - Must also validate that renewalDate is not in the past (new Date(row.renewalDate) > new Date())
        - Generate hash: crypto.createHash('sha256').update(JSON.stringify({client, policy, renewalDate, adviser})).digest('hex')
     c) Insert upload batch: supabase.from('upload_batches').insert({ filename: originalname, total_rows, valid_rows, invalid_rows }).select().single() → get batchId
     d) Bulk insert valid rows to renewals table (status: 'pending', upload_batch: batchId, hash)
     e) Bulk insert invalid rows to failed_renewals (upload_batch: batchId, row_number, raw_data JSONB, errors array)
     f) Return UploadResponse with batchId, counts, errorReportUrl: /api/renewals/errors/${batchId}
   - Handle duplicate hashes: use supabase.from('renewals').upsert with onConflict: 'hash' to skip duplicates silently

3. backend/src/modules/upload/upload.controller.ts:
   - Class UploadController (@Controller('api/renewals'))
   - POST /upload — @UseInterceptors(FileInterceptor('file')), @UploadedFile() file: Express.Multer.File
     - Uses FileValidationPipe (already exists at ../../common/pipes/file-validation.pipe)
     - Calls uploadService.processUpload(file.buffer, file.originalname, file.originalname)
     - Returns UploadResponse
   - GET /errors/:batchId — downloads error CSV
     - Fetches from failed_renewals WHERE upload_batch = batchId
     - Generates CSV string: "Row,Field,Error\n1,Adviser,Required field is missing\n..."
     - Returns with Content-Type: text/csv, Content-Disposition: attachment
   - Use @ApiTags('Renewals'), @ApiOperation, @ApiConsumes, @ApiBody decorators from @nestjs/swagger

4. backend/src/modules/upload/upload.module.ts:
   - Imports: forwardRef(() => RenewalModule) if needed, or standalone
   - Providers: UploadService, ExcelParserService, { provide: 'SUPABASE_CLIENT', useFactory: () => supabase from ../../database/supabase }
   - Controllers: [UploadController]
   - Exports: [UploadService, ExcelParserService]

IMPORTANT:
- Use `import { supabase } from '../../database/supabase'` for the Supabase client
- Use Pino logger via constructor injection: @InjectPinoLogger(UploadService.name) private readonly logger: PinoLogger
- All error handling: try/catch with logger.error and throw new InternalServerErrorException or BadRequestException
- Import crypto from 'crypto' for hashing
- Use validate from 'class-validator' and plainToInstance from 'class-transformer'
- Do NOT read any existing files. Create only the 4 files above.
```

### Agent B — Renewal Module

```
Agent B — Renewal Module + Repository. Create these files. Do NOT read any existing files.

PROJECT: NestJS backend at backend/src/. Uses Supabase JS client from database/supabase.ts.

YOUR TASK: Create the renewal repository, service, controller, and module.

THE CONTRACT (already exists — import only, do NOT recreate):

// backend/src/modules/renewal/dto/renewal-filter.dto.ts — ALREADY EXISTS, just import from './dto/renewal-filter.dto'
export enum RenewalStatus { PENDING = 'pending', PROCESSING = 'processing', SENT = 'sent', FAILED = 'failed' }
export enum SortField { CLIENT_NAME = 'clientName', POLICY_NAME = 'policyName', RENEWAL_DATE = 'renewalDate', PREMIUM = 'premium', ADVISER_NAME = 'adviserName', STATUS = 'status', SENT_AT = 'sentAt', CREATED_AT = 'createdAt' }
export class RenewalFilterDto { page?: number = 1; limit?: number = 10; status?: RenewalStatus; adviser?: string; sortBy?: SortField = SortField.RENEWAL_DATE; sortOrder?: 'asc' | 'desc' = 'asc'; }

// backend/src/modules/renewal/dto/renewal-response.dto.ts — ALREADY EXISTS
export interface RenewalResponse { id: string; clientName: string; policyName: string; renewalDate: string; premium: number | null; adviserName: string; adviserPhone: string; status: 'pending'|'processing'|'sent'|'failed'; sentAt: string | null; createdAt: string; lastError: string | null; retryCount: number; }
export interface RenewalPaginatedResponse { data: RenewalResponse[]; pagination: { page: number; limit: number; total: number; totalPages: number } }

FILES TO CREATE:

1. backend/src/modules/renewal/repositories/renewal.repository.ts:
   - Class RenewalRepository (@Injectable)
   - Inject supabase via custom token 'SUPABASE_CLIENT'
   - DB column names are snake_case (client_name, policy_name, etc.)
   - Methods (all async, all return Promise):
     a) insertMany(rows: Array<{...}>) → insert into renewals, ignore duplicates via upsert on 'hash', return inserted count
     b) findAll(filters: RenewalFilterDto): Promise<RenewalPaginatedResponse>
        - Build query: supabase.from('renewals').select('*', { count: 'exact' })
        - Apply WHERE: .eq('status', filters.status) if status set
        - Apply WHERE: .ilike('adviser_name', `%${filters.adviser}%`) if adviser set
        - Apply ORDER: column map { clientName→'client_name', policyName→'policy_name', renewalDate→'renewal_date', premium→'premium', adviserName→'adviser_name', status→'status', sentAt→'sent_at', createdAt→'created_at' }
        - Apply range: .range((page-1)*limit, page*limit-1)
        - Return { data: map to RenewalResponse[], pagination: { page, limit, total: count, totalPages: Math.ceil(count/limit) } }
     c) updateStatus(id: string, status: string, extra?: { ai_message?: string; sent_at?: string; last_error?: string; retry_count?: number }) → update renewals by id
     d) findPending(page: number, limit: number) → renewals where status = 'pending', ordered by created_at ASC
     e) getErrorReport(batchId: string) → failed_renewals WHERE upload_batch = batchId

   Column mapping helper (snake_case DB → camelCase response):
   ```typescript
   private mapRow(row: any): RenewalResponse {
     return {
       id: row.id,
       clientName: row.client_name,
       policyName: row.policy_name,
       renewalDate: row.renewal_date,
       premium: row.premium,
       adviserName: row.adviser_name,
       adviserPhone: row.adviser_phone,
       status: row.status,
       sentAt: row.sent_at,
       createdAt: row.created_at,
       lastError: row.last_error,
       retryCount: row.retry_count,
     };
   }
   ```

2. backend/src/modules/renewal/renewal.service.ts:
   - Class RenewalService (@Injectable)
   - Inject: RenewalRepository, InjectPinoLogger
   - async getRenewals(filters: RenewalFilterDto): Promise<RenewalPaginatedResponse>
     → calls repository.findAll(filters)
   - async getErrorReport(batchId: string): fail_renewals rows from repository

3. backend/src/modules/renewal/renewal.controller.ts:
   - Class RenewalController (@Controller('api'))
   - GET /renewals — @Query() filters: RenewalFilterDto → returns RenewalPaginatedResponse
     Use @ApiQuery decorators for page, limit, status, adviser, sortBy, sortOrder
     Use @ApiResponse for 200 and 400
   - GET /renewals/errors/:batchId — downloads error CSV
     Use @ApiParam for batchId
     Returns CSV with Content-Type header
   - Swagger: @ApiTags('Renewals'), @ApiOperation on each method

4. backend/src/modules/renewal/renewal.module.ts:
   - Imports: []
   - Providers: [RenewalService, RenewalRepository, { provide: 'SUPABASE_CLIENT', useFactory: () => { const { supabase } = require('../../database/supabase'); return supabase; } }]
   - Controllers: [RenewalController]
   - Exports: [RenewalService, RenewalRepository]

IMPORTANT:
- Use `import { supabase } from '../../database/supabase'` for the client
- Logger: @InjectPinoLogger(ClassName.name) private readonly logger: PinoLogger
- All DB inserts use .select().single() to get the created row
- Pagination: total comes from the count property in Supabase response (use { count: 'exact' })
- Do NOT read existing files. Create only the 4 files above.
```

### Agent C — AI + Queue + Telegram Modules

```
Agent C — AI, Queue, and Telegram Modules. Create these files. Do NOT read any existing files.

PROJECT: NestJS backend at backend/src/. Uses Supabase, OpenAI, BullMQ+ioredis, Telegram Bot API.

YOUR TASK: Create ai.module, queue.module, telegram.module with all their files.

===== AI MODULE =====

FILES TO CREATE:

1. backend/src/modules/ai/prompts/renewal-reminder.prompt.ts:
```
export const RENEWAL_REMINDER_SYSTEM_PROMPT = `You are a professional assistant for a financial advisory firm.
Generate a WhatsApp-style reminder message to a financial adviser about their client's upcoming policy renewal.

RULES:
1. Use EXACTLY this structure each time:
   - Greeting: "Hi {adviser's first name} 👋"
   - Body: "Your client {client name} has a policy renewal on {date}."
   - Policy: "Policy: {policy name}"
   - Premium: "Premium: S${amount}" (OMIT this line completely if premium is null, 0, or empty)
   - Closing: "Please contact your client before the renewal date."

2. TONE: Professional, warm, helpful. Never alarming or urgent.
3. FORMAT: Plain text only. No markdown, no HTML, no bullet points.
4. LANGUAGE: English only.
5. EMOJI: Only the wave emoji (👋) in the greeting line. No other emojis anywhere.
6. Never include: phone numbers, links, signatures, email addresses, or "Best regards".
7. Keep it concise - maximum 5 lines total. Do not add extra commentary.`;

export function buildRenewalUserPrompt(data: {
  adviserName: string;
  clientName: string;
  policyName: string;
  renewalDate: string;
  premium: number | null;
}): string {
  const lines = [
    `Generate a reminder for:`,
    `- Adviser: ${data.adviserName}`,
    `- Client: ${data.clientName}`,
    `- Policy: ${data.policyName}`,
    `- Renewal Date: ${data.renewalDate}`,
  ];
  if (data.premium != null && data.premium > 0) {
    lines.push(`- Premium: S$${data.premium.toLocaleString()}`);
  }
  return lines.join('\n');
}
```

2. backend/src/modules/ai/ai.service.ts:
   - Class AiService (@Injectable)
   - Inject: InjectPinoLogger, import OpenAI client from config
   - Constructor creates OpenAI client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
   - async generateMessage(data: { adviserName: string; clientName: string; policyName: string; renewalDate: string; premium: number | null }): Promise<string>
     - Calls openai.chat.completions.create({
         model: 'gpt-4o-mini',
         temperature: 0.3,
         max_tokens: 300,
         messages: [
           { role: 'system', content: RENEWAL_REMINDER_SYSTEM_PROMPT },
           { role: 'user', content: buildRenewalUserPrompt(data) }
         ]
       })
     - Returns response.choices[0].message.content.trim()
     - On error: logger.error, throw new InternalServerErrorException

3. backend/src/modules/ai/ai.module.ts:
   - Providers: [AiService]
   - Exports: [AiService]

===== TELEGRAM MODULE =====

4. backend/src/modules/telegram/telegram.service.ts:
   - Class TelegramService (@Injectable)
   - Inject: InjectPinoLogger, and supabase client
   - async sendMessage(chatId: string, text: string): Promise<boolean>
     - POST to https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage
     - Body: { chat_id: chatId, text: text }
     - Return true if response.ok, false otherwise
     - On error: logger.error, return false (caller handles retry)
   - async detectChatId(): Promise<string | null>
     - GET https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates
     - Parse response, find most recent message, extract chat.id
     - If found, upsert into bot_config (id=1, chat_id, is_connected=true, updated_at=now)
     - Return chat_id or null
   - async getStatus(): Promise<{ connected: boolean; chatId?: string; instructions?: string }>
     - Query bot_config where id=1
     - If connected: return { connected: true, chatId }
     - If not: return { connected: false, instructions: 'Open @GomaRenewalsBot on Telegram and click Start.' }

5. backend/src/modules/telegram/telegram.controller.ts:
   - Class TelegramController (@Controller('api/telegram'))
   - GET /status → returns TelegramStatus (connected bool, chatId?, instructions?)
   - POST /connect → calls detectChatId(), returns status
   - Swagger: @ApiTags('Telegram')

6. backend/src/modules/telegram/telegram.module.ts:
   - Providers: [TelegramService, { provide: 'SUPABASE_CLIENT', useFactory: () => { const { supabase } = require('../../database/supabase'); return supabase; } }]
   - Controllers: [TelegramController]
   - Exports: [TelegramService]

===== QUEUE MODULE =====

7. backend/src/modules/queue/rate-limiter.service.ts:
   - Class RateLimiterService (@Injectable)
   - Token bucket: private tokens: number = 80, maxTokens: number = 80, refillRate: number = 80/1000 (tokens per ms), lastRefill: number = Date.now()
   - tryConsume(): boolean — refills tokens based on elapsed time, consumes 1 if available, returns true/false
   - This is for the WhatsApp/Telegram rate limit (Meta allows ~80/sec, Telegram allows ~30/sec — use 20/sec as safe limit)

8. backend/src/modules/queue/queue.service.ts:
   - Class QueueService (@Injectable)
   - Inject: InjectPinoLogger
   - Constructor creates BullMQ Queue('renewal-notifications', { connection: { url: process.env.REDIS_URL } })
   - async addJobs(renewals: Array<{ id: string; clientName: string; policyName: string; renewalDate: string; premium: number | null; adviserName: string; adviserPhone: string }>): Promise<void>
     - For each renewal, add job to queue with 5 second delay
     - Job data: { renewalId, clientName, policyName, renewalDate, premium, adviserName, adviserPhone }
   - async getQueueStats(): Promise<{ waiting: number; active: number; completed: number; failed: number }>
     - Returns queue.getJobCounts()

9. backend/src/modules/queue/queue.processor.ts:
   - Class RenewalProcessor (@Processor('renewal-notifications'))
   - This is a BullMQ Worker processor
   - Inject: AiService, TelegramService, RateLimiterService, InjectPinoLogger, supabase client
   - @Process() async handleRenewal(job: Job):
     Steps:
     a) Update renewal status to 'processing' (supabase update renewals set status='processing' where id=job.data.renewalId)
     b) Wait for rate limiter token: while(!rateLimiter.tryConsume()) await sleep(100)
     c) Call aiService.generateMessage({ adviserName: job.data.adviserName, clientName: job.data.clientName, policyName: job.data.policyName, renewalDate: job.data.renewalDate, premium: job.data.premium })
     d) Get chat_id from bot_config table (supabase.from('bot_config').select('chat_id').eq('id', 1).single())
     e) If no chat_id, update status to 'failed', error 'No Telegram chat ID configured'
     f) Call telegramService.sendMessage(chatId, aiMessage)
     g) If success: update renewal (status='sent', ai_message, sent_at=now)
     h) If failure: update renewal (status='failed', last_error='Telegram send failed', retry_count++)
     i) logger.info for each step

   - BullMQ will auto-retry failed jobs. We set job opts: { attempts: 3, backoff: { type: 'exponential', delay: 60000 } }
   - The QueueService should configure jobs with these opts when adding.

10. backend/src/modules/queue/queue.module.ts:
    - Use BullModule.registerQueue({ name: 'renewal-notifications' }) from @nestjs/bull
    - Wait — actually we're using raw bullmq, not @nestjs/bull. So:
    - Providers: [QueueService, RenewalProcessor, RateLimiterService, 
                 { provide: 'SUPABASE_CLIENT', useFactory: ... }]
    - Imports: []
    - Exports: [QueueService]

    Actually, to make BullMQ work in NestJS without @nestjs/bull:
    - Create queue in QueueService constructor
    - Create worker in RenewalProcessor constructor (use OnModuleInit to start it)
    
    QueueService constructor pattern:
    ```typescript
    constructor(@InjectPinoLogger(QueueService.name) private readonly logger: PinoLogger) {
      this.queue = new Queue('renewal-notifications', {
        connection: { url: process.env.REDIS_URL },
      });
    }
    ```
    
    RenewalProcessor pattern — implements OnModuleInit:
    ```typescript
    export class RenewalProcessor implements OnModuleInit {
      private worker: Worker;
      constructor(
        private readonly aiService: AiService,
        private readonly telegramService: TelegramService,
        private readonly rateLimiter: RateLimiterService,
        @InjectPinoLogger(RenewalProcessor.name) private readonly logger: PinoLogger,
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
      ) {}
      
      onModuleInit() {
        this.worker = new Worker('renewal-notifications', this.processJob.bind(this), {
          connection: { url: process.env.REDIS_URL },
          concurrency: 5,
        });
      }
      
      private async processJob(job: Job) {
        // The processing logic described above
      }
    }
    ```

IMPORTANT:
- Use axios or fetch for Telegram HTTP calls (prefer fetch — it's built into Node.js 18+)
- For OpenAI: import OpenAI from 'openai'
- For BullMQ: import { Queue, Worker, Job } from 'bullmq'
- Logger pattern: this.logger.info({ jobId: job.id }, 'Processing renewal')
- Sleep helper: const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
- Do NOT read any existing files. Create only the files specified above.
```

---

## Phase 3 — Integration Wiring (Orchestrator/You)

After Phase 2 agents complete, paste this:

```
Phase 3 — Integration Wiring.

1. Update backend/src/app.module.ts: Import and wire all modules:
   - ConfigModule.forRoot({ isGlobal: true, load: [...all configs], validationSchema: Joi.object(...) })
   - ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', '..', 'frontend', 'dist'), exclude: ['/api/(.*)'] }) — for production
   - RenewalModule
   - UploadModule
   - AiModule
   - QueueModule
   - TelegramModule
   
   Also apply global pipes and filters:
   - { provide: APP_PIPE, useClass: ValidationPipe } with { whitelist: true, transform: true }
   - { provide: APP_FILTER, useClass: HttpExceptionFilter }
   - { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }
   - { provide: APP_INTERCEPTOR, useClass: TimingInterceptor }

   Enable CORS: app.enableCors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' })

2. Update backend/src/main.ts:
   async function bootstrap() {
     const app = await NestFactory.create(AppModule);
     
     // Run DB migrations on startup
     await runMigrations();

     // Swagger setup
     const config = new DocumentBuilder()
       .setTitle('Goma AI Renewal Notifications')
       .setDescription('API for uploading policy renewals and sending Telegram notifications')
       .setVersion('1.0')
       .build();
     const document = SwaggerModule.createDocument(app, config);
     SwaggerModule.setup('api/docs', app, document);

     await app.listen(process.env.PORT || 3000);
   }
   
   For runMigrations: Use supabase_apply_migration to create tables if not exist. But tables were already created in Phase 1 via MCP, so this is a no-op OR can check if tables exist and create if missing.

3. Verify: pnpm run build in backend/ must pass with zero errors.
```

---

## Phase 4 — Frontend (Single Agent)

Paste this after Phase 3 completes:

```
Agent F — Frontend. Create a React + Vite + Tailwind + shadcn/ui app at frontend/.

YOUR TASK: Scaffold the frontend and build two pages: Upload and Dashboard. Also a bot connection flow.

1. SCAFFOLD:
   - npm create vite@latest frontend -- --template react-ts
   - cd frontend && npm install && npm install -D tailwindcss @tailwindcss/vite postcss
   - Also install: react-dropzone axios @shadcn/ui lucide-react
   - Configure tailwind via vite plugin in vite.config.ts
   - Set up shadcn/ui (npx shadcn@latest init — use defaults, TypeScript, Tailwind v4, CSS variables)

2. API CLIENT — frontend/src/api/client.ts:
```
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export interface RenewalResponse {
  id: string;
  clientName: string;
  policyName: string;
  renewalDate: string;
  premium: number | null;
  adviserName: string;
  adviserPhone: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  sentAt: string | null;
  createdAt: string;
  lastError: string | null;
  retryCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UploadResult {
  batchId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errorReportUrl: string;
}

export interface BotStatus {
  connected: boolean;
  chatId?: string;
  instructions?: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<UploadResult>('/renewals/upload', form);
  return data;
}

export async function getRenewals(params: {
  page?: number;
  limit?: number;
  status?: string;
  adviser?: string;
  sortBy?: string;
  sortOrder?: string;
}): Promise<PaginatedResponse<RenewalResponse>> {
  const { data } = await api.get('/renewals', { params });
  return data;
}

export async function downloadErrors(batchId: string): Promise<Blob> {
  const { data } = await api.get(`/renewals/errors/${batchId}`, { responseType: 'blob' });
  return data;
}

export async function getBotStatus(): Promise<BotStatus> {
  const { data } = await api.get('/telegram/status');
  return data;
}

export async function connectBot(): Promise<BotStatus> {
  const { data } = await api.post('/telegram/connect');
  return data;
}
```

3. COMPONENTS:

a) BotConnection.tsx:
   - On mount, calls getBotStatus()
   - If connected: green banner "✅ Bot Connected — {chatId}"
   - If not: card with instructions "Open @GomaRenewalsBot on Telegram and click Start, then click Connect below"
   - [Connect Telegram] button — calls connectBot(), polls every 3s until connected
   - Loading spinner while detecting

b) FileDropZone.tsx:
   - Uses react-dropzone
   - Beautiful dashed border drop zone with cloud upload icon (lucide)
   - Text: "Drag & drop your Excel/CSV file here, or click to browse"
   - Accepts: .xlsx, .xls, .csv
   - Max file size: 10MB (show error if exceeds)
   - Shows selected file name with size
   - Shows upload progress bar during upload

c) ValidationResults.tsx:
   - Props: { valid: number, invalid: number, errorReportUrl: string, batchId: string }
   - Green card: "✅ {valid} Valid rows processed"
   - Red card: "❌ {invalid} Invalid rows found"
   - If invalid > 0: [Download Error Report] button (downloads CSV via downloadErrors)
   - Shows "228 notifications queued!" with a bell/notification icon

d) StatusBadge.tsx:
   - Props: { status: string }
   - pending → yellow/amber pill badge
   - processing → blue pill badge with spinning icon
   - sent → green pill badge with checkmark
   - failed → red pill badge with X

e) FilterBar.tsx:
   - Status dropdown: All | Pending | Processing | Sent | Failed
   - Adviser search input with magnifying glass icon, debounced 300ms
   - Both onChange call parent's onFilterChange

f) RenewalTable.tsx:
   - Columns: Client, Policy Name, Renewal Date, Premium (S$ format), Adviser, Status (StatusBadge), Sent At
   - Click column header to sort (shows ▲/▼ indicator)
   - Loading: show skeleton rows
   - Empty: "No renewals found" with illustration

g) Pagination.tsx:
   - Props: { page, totalPages, onPageChange }
   - Shows: ◀ Previous | Page X of Y | Next ▶
   - Disable Previous on page 1, disable Next on last page

4. PAGES:

a) Upload.tsx (route: /):
   - Layout: max-w-3xl mx-auto, centered vertically
   - Title: "Policy Renewal Notifications" with subtitle "Upload your monthly renewal spreadsheet"
   - BotConnection at top (only shows if not connected, upload disabled until connected)
   - FileDropZone
   - ValidationResults (appears after upload)
   - Error handling: toast for network errors

b) Dashboard.tsx (route: /dashboard):
   - Layout: max-w-6xl mx-auto
   - Title: "Renewals Dashboard"
   - FilterBar at top
   - RenewalTable
   - Pagination at bottom
   - Auto-refresh every 10 seconds (optional, nice touch)
   - Calls getRenewals with current filters on mount and filter change

5. App.tsx:
   - React Router with two routes: / → Upload, /dashboard → Dashboard
   - Navigation tabs at top: [Upload] [Dashboard]
   - Clean, professional design: white background, subtle shadows, Inter font

6. DESIGN REQUIREMENTS:
   - Use shadcn/ui components (Button, Card, Input, Badge, Table, Select, Skeleton)
   - Colors: primary = indigo/blue-600, success = emerald-500, error = red-500, warning = amber-500
   - Professional, clean aesthetic. Think Stripe/Linear/Vercel quality.
   - Responsive: works on tablet and desktop
   - All states covered: loading (skeletons), empty, error, success
   - Toast notifications for errors using shadcn Sonner (npm install sonner)

7. Configure vercel.json in frontend/:
```json
{
  "rewrites": [{ "source": "/api/:path*", "destination": "https://goma-backend.onrender.com/api/:path*" }]
}
```
This way the frontend can proxy API calls without CORS issues. Actually no — use the VITE_API_URL env var approach instead (already configured in api/client.ts). No vercel.json rewrite needed. But add a vercel.json for Vite SPA routing:
```json
{
  "rewrites": [{ "source": "/((?!api).*)", "destination": "/index.html" }]
}
```

8. Verify: npm run build in frontend/ must pass with zero errors.
```

---

## Phase 5 — Tests + README (2 Agents in Parallel)

Paste both simultaneously after Phase 4 completes.

### Agent G — Tests

```
Agent G — Unit and Integration Tests. Create test files at backend/test/.

PROJECT: NestJS backend using Jest. Tests run with `npx jest`.

FILES TO CREATE:

1. backend/test/unit/upload.service.spec.ts (10+ tests):
   - Mock SupabaseClient, ExcelParserService, PinoLogger
   - Test: parses valid XLSX buffer returns correct rows
   - Test: parses valid CSV buffer returns correct rows
   - Test: rejects missing adviser name
   - Test: rejects invalid phone format (not SG)
   - Test: rejects renewal date in the past
   - Test: accepts row with missing premium as valid
   - Test: detects duplicate rows via hash
   - Test: inserts valid rows to database
   - Test: inserts invalid rows to failed_renewals
   - Test: throws on unparseable file
   Use jest.fn() for all external dependencies.

2. backend/test/unit/renewal.service.spec.ts (8+ tests):
   - Mock RenewalRepository
   - Test: returns paginated results with correct structure
   - Test: filters by status correctly
   - Test: filters by adviser partial match
   - Test: sorts by renewalDate ascending
   - Test: sorts by premium descending
   - Test: returns empty array when no results
   - Test: handles database errors gracefully

3. backend/test/unit/ai.service.spec.ts (6+ tests):
   - Mock OpenAI client (jest.mock('openai'))
   - Test: includes premium line when premium > 0
   - Test: omits premium line when premium is null
   - Test: omits premium line when premium is 0
   - Test: formats renewal date in readable format
   - Test: calls OpenAI with correct model and temperature
   - Test: throws InternalServerErrorException on API failure

4. backend/test/unit/telegram.service.spec.ts (5+ tests):
   - Mock fetch (global.fetch = jest.fn())
   - Test: sendMessage returns true on success
   - Test: sendMessage returns false on API error
   - Test: detectChatId extracts chat_id from getUpdates
   - Test: detectChatId returns null when no messages
   - Test: getStatus returns connected when bot_config has chat_id

5. backend/test/unit/queue.processor.spec.ts (5+ tests):
   - Mock AiService, TelegramService, RateLimiterService, SupabaseClient
   - Test: processes job and updates status to sent
   - Test: retries on failure (checks retry_count increment)
   - Test: marks failed after max retries
   - Test: respects rate limiter (blocks when tokens exhausted)
   - Test: skips when no chat_id configured

6. backend/test/integration/renewal.controller.spec.ts (4+ tests):
   - Use Test.createTestingModule from @nestjs/testing
   - Test: POST /api/renewals/upload returns valid UploadResponse
   - Test: GET /api/renewals returns paginated results
   - Test: GET /api/renewals?status=sent filters correctly
   - Test: GET /api/renewals/errors/:batchId returns CSV

Use this pattern for NestJS unit tests:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

describe('ServiceName', () => {
  let service: ServiceName;
  let mockRepo: jest.Mocked<RepositoryName>;

  beforeEach(async () => {
    mockRepo = { findAll: jest.fn(), insertMany: jest.fn() } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceName,
        { provide: RepositoryName, useValue: mockRepo },
      ],
    }).compile();
    service = module.get(ServiceName);
  });

  it('should ...', async () => {
    // arrange, act, assert
  });
});
```

All tests must pass: `npx jest --passWithNoTests`.
```

### Agent H — README

```
Agent H — Create README.md at the project root.

CONTENT:

```markdown
# Goma AI — Policy Renewal Notification Agent

An internal automation tool for financial advisory companies. Upload monthly policy renewal spreadsheets and automatically notify financial advisers via Telegram.

## Live Demo

- **Frontend:** https://goma-renewals.vercel.app
- **API Docs:** https://goma-backend.onrender.com/api/docs
- **Telegram Bot:** @GomaRenewalsBot

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Vercel         │────▶│   Render         │────▶│   Supabase        │
│   React Frontend │     │   NestJS API     │     │   PostgreSQL      │
│   (Free Tier)    │     │   (Free Tier)    │     │   (Free Tier)     │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼──────┐ ┌───▼────┐ ┌──────▼──────┐
              │  Upstash    │ │ OpenAI │ │  Telegram    │
              │  Redis      │ │ GPT-4o │ │  Bot API     │
              │  (Free)     │ │  Mini  │ │  (Free)      │
              └─────────────┘ └────────┘ └──────────────┘
```

### Data Flow

1. User uploads Excel/CSV via web UI
2. Backend parses and validates each row against business rules
3. Valid rows stored in PostgreSQL, invalid rows captured in error report
4. Each valid renewal enters BullMQ queue (5s delay buffer)
5. Queue workers process jobs sequentially with rate limiting
6. Each job: AI generates a professional WhatsApp-style message via OpenAI
7. Message sent to adviser via Telegram Bot API
8. Status tracked: pending → processing → sent | failed (with auto-retry)

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | NestJS + TypeScript | REST API, DI, validation, Swagger docs |
| Frontend | React + Vite + Tailwind + shadcn/ui | Upload UI, dashboard |
| Database | PostgreSQL via Supabase | Renewal records, error tracking |
| Queue | BullMQ + Redis via Upstash | Background job processing with retries |
| AI | OpenAI GPT-4o-mini | Generate personalized reminder messages |
| Messaging | Telegram Bot API | Deliver notifications to advisers |
| Hosting | Render (backend) + Vercel (frontend) | Free tier, zero cost deployment |

## Setup Instructions

### Prerequisites

1. A [Supabase](https://supabase.com) account (free tier) — for PostgreSQL
2. An [OpenAI API key](https://platform.openai.com/api-keys) — for message generation
3. An [Upstash Redis](https://upstash.com) database (free tier) — for BullMQ queue
4. A Telegram bot token from [@BotFather](https://t.me/BotFather) — for notifications

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/goma-renewals.git
   cd goma-renewals
   ```

2. Create `.env` in the project root:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=eyJ... (service_role key, not anon)
   OPENAI_API_KEY=sk-...
   REDIS_URL=rediss://default:password@your-upstash.upstash.io:6379
   TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
   NODE_ENV=development
   PORT=3000
   LOG_LEVEL=info
   CORS_ORIGIN=http://localhost:5173
   ```

3. Run database migrations:
   ```bash
   # The backend auto-runs migrations on startup
   cd backend && pnpm install && pnpm run start:dev
   ```

4. Start the frontend:
   ```bash
   cd frontend && npm install && npm run dev
   ```

5. Open http://localhost:5173

### Production Deployment

1. **Backend (Render):**
   - Create a Web Service, connect GitHub repo
   - Root directory: `backend`
   - Build command: `pnpm install && pnpm run build`
   - Start command: `node dist/main.js`
   - Add all environment variables from `.env`

2. **Frontend (Vercel):**
   - Import GitHub repo
   - Root directory: `frontend`
   - Framework: Vite
   - Add env var: `VITE_API_URL=https://your-backend.onrender.com/api`
   - Update Render's `CORS_ORIGIN` to the Vercel URL

3. **Bot Setup:**
   - Open `@GomaRenewalsBot` on Telegram
   - Click **Start**
   - Visit the Vercel URL → click **Connect Telegram**

## Assumptions

1. **Singapore phone format:** Adviser phone numbers follow SG conventions (`+65 xxxx xxxx` or `xxxx xxxx`)
2. **Single bot instance:** One Telegram bot serves all notifications (chat_id auto-detected)
3. **Excel headers:** Columns named exactly "Adviser", "Adviser Phone", "Client", "Policy", "Renewal Date", "Premium" (case-insensitive matching applied)
4. **Timezone:** All dates treated as Singapore time (UTC+8)
5. **Single recipient:** All notifications go to one evaluator's Telegram (production would support per-adviser routing)
6. **Monthly batch:** Renewals uploaded once per month. The system does not handle incremental/delta uploads.

## Architecture Decisions & Trade-offs

### Why Supabase Client (not TypeORM/Prisma)
- Zero migration setup overhead (tables created via MCP)
- Reference project (ai-frontdesk) uses the same pattern
- Trade-off: No decorator-based entities; manual column mapping needed for snake_case → camelCase

### Why BullMQ with In-Process Worker
- BullMQ provides exactly-once semantics, retries with backoff, rate limiting
- Worker runs within the NestJS process for simplicity
- Trade-off: Scaling requires splitting worker to separate process (not needed for prototype)

### Why Telegram (not WhatsApp)
- Telegram Bot API has simpler auth (token-based, no business verification)
- No webhook URL needed for outgoing messages
- Trade-off: Assessment mentions "WhatsApp Service" — Telegram fills the same role with an alternate transport

### Why OpenAI GPT-4o-mini
- Cheapest model with excellent structured text generation ($0.15/1M tokens)
- Consistent output format (critical for professional messages)
- Trade-off: Vendor lock-in; could swap to any OpenAI-compatible API

### Why In-Process Rate Limiter
- Token bucket algorithm (80 tokens, 80/sec refill) prevents hitting Telegram's 30/sec rate limit
- Single-instance, in-memory
- Trade-off: Not distributed (OK for single Render instance; would need Redis-based for multi-instance)

## Future Improvements

1. **Per-Adviser Routing:** Support multiple Telegram chat IDs, one per adviser, so each gets only their own clients' renewals
2. **Scheduled Uploads:** Cron-based recurring monthly uploads using BullMQ repeatable jobs
3. **Admin Dashboard:** Manual retry button for failed messages, resend capability, bulk actions
4. **Delivery Receipts:** Webhook endpoint to receive Telegram delivery confirmations
5. **API Authentication:** JWT or API key auth on endpoints (currently open for prototype evaluation)
6. **Separate Worker Process:** Deploy queue worker as a separate Render service for independent scaling
7. **Distributed Rate Limiting:** Redis-based token bucket for multi-instance deployments
8. **CSV Template Download:** "Download template" button on the upload page so users get the exact column format
9. **Email Fallback:** If Telegram fails, fall back to email notification via Resend/SendGrid
10. **Audit Log:** Track who uploaded which file and when for compliance

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/renewals/upload` | Upload Excel/CSV file |
| GET | `/api/renewals` | List renewals (paginated, filterable) |
| GET | `/api/renewals/errors/:batchId` | Download error report CSV |
| GET | `/api/telegram/status` | Check bot connection status |
| POST | `/api/telegram/connect` | Attempt bot connection |
| GET | `/api/docs` | Swagger/OpenAPI UI |

## Testing

```bash
cd backend
pnpm test
pnpm test:cov      # Coverage report
pnpm test:e2e      # End-to-end tests
```

## License

MIT
```

The README must be comprehensive. Include all sections: Setup, Assumptions, Architecture, Trade-offs, Improvements as required by the assessment.

Also create backend/.env.example and frontend/.env.example files with all required keys listed but no values.
```

---

## Phase 6 — Final Verification (Orchestrator/You)

```
Phase 6 — Final Verification.

Do all of these:
1. pnpm run build in backend/ — must pass with zero errors
2. pnpm run lint in backend/ — must pass (if linting is configured)
3. pnpm test in backend/ — all tests must pass
4. pnpm run build in frontend/ — must pass
5. Verify .env is gitignored (check .gitignore)
6. Verify .env.example has all keys without values
7. Initialize git repo, commit all files
8. Push to GitHub
9. Deploy backend to Render (or verify existing deployment)
10. Deploy frontend to Vercel (or verify existing deployment)
11. Test: upload sample XLSX → verify Telegram notification received
12. Update Render CORS_ORIGIN to Vercel URL if needed

Return: confirmation that all steps passed.
```

---

## Summary — Execution Order

| Phase | Agent(s) | What |
|-------|----------|------|
| **Phase 1** | You (paste command #1) | Foundation, config, DTOs, DB, common |
| **Phase 2** | 3 agents in parallel (paste commands A, B, C at once) | Upload, Renewal, AI+Queue+Telegram modules |
| **Phase 3** | You (paste command #3) | Wire app.module, main.ts, Swagger |
| **Phase 4** | 1 agent (paste command #4) | React frontend |
| **Phase 5** | 2 agents in parallel (paste G, H at once) | Tests + README |
| **Phase 6** | You (paste command #6) | Final verification + deploy |

**Total:** 6 chat messages. Each phase waits for previous to complete. Phases 2 and 5 run agents in parallel.
