# Goma AI — Master Execution Plan

> **Status: Implemented** | Backend: `https://goma-backend.onrender.com` | Frontend: `https://goma-frontend.vercel.app` | Bot: `@renewal_notification_agent_bot` | Tests: 29/29 passing

## Table of Contents
1. [Prerequisites (Manual Steps — Do First)](#prerequisites)
2. [Architecture Overview](#architecture)
3. [Database Schema](#database)
4. [API Specification](#api)
5. [Component Tree & Data Flow](#data-flow)
6. [AI Prompt Strategy](#ai-prompt)
7. [Task Breakdown & Agent Plan](#tasks)
8. [File Manifest (Every File We'll Create)](#manifest)
9. [Environment Variables](#env-vars)
10. [Checklist](#checklist)
11. [Testing Strategy](#testing)
12. [Deployment (Render + Vercel)](#deployment)
13. [README Outline](#readme)

---

## <a id="prerequisites"></a>1. Prerequisites — Manual Steps (Do These Before Any Code)

### Step 1: Supabase (PostgreSQL) — 3 min

1. Go to [supabase.com](https://supabase.com) → **Start your project** (free tier)
2. Choose a project name: `goma-renewals`
3. Set a database password (save it in your password manager, you won't need it again)
4. Wait ~2 min for the project to provision
5. Go to **Settings** → **API**
6. Copy these two values:

| What to Copy | Where to Find It | Env Name |
|---|---|---|
| Project URL | Settings → API → **Project URL** | `SUPABASE_URL` |
| Service Role Key | Settings → API → **service_role** (secret) | `SUPABASE_SERVICE_KEY` |

### Step 2: OpenAI API Key — 2 min

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Name it `goma-renewals`
4. Copy the key immediately (you won't see it again)

| What to Copy | Env Name |
|---|---|
| Secret key (starts with `sk-`) | `OPENAI_API_KEY` |

### Step 3: Upstash Redis (Free) — 2 min

1. Go to [upstash.com](https://upstash.com) → **Create Redis Database**
2. Choose the free tier (256MB, 1 database, shared)
3. Name: `goma-redis`
4. Region: Singapore (`ap-southeast-1`) — closest to Render SG
5. After creation, go to **Connect** tab
6. Copy the **Redis URL** (TCP, starts with `rediss://`)

| What to Copy | Env Name |
|---|---|
| Redis URL (`rediss://default:...`) | `REDIS_URL` |

> **Make sure you get the `rediss://` URL** (TCP protocol), not the `https://` REST URL. BullMQ requires raw TCP. The password is embedded in the URL.

### Step 4: Telegram Bot — 3 min

1. Open Telegram → search **@BotFather** → click Start
2. Send: `/newbot`
3. Name: `Goma Renewals Demo`
4. Username: `@GomaRenewalsBot` (must end in `bot`)
5. @BotFather will reply with the token

| What to Copy | Env Name |
|---|---|
| Bot token (like `1234567890:ABCdef...`) | `TELEGRAM_BOT_TOKEN` |

> **You do NOT need a chat ID manually.** The app auto-detects the evaluator's chat ID when they click "Start" on the bot and then hit "Connect" on the web UI.

### Step 5: Confirm Collected Values

You should now have these 5 env vars ready:

```bash
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
OPENAI_API_KEY=sk-proj-...
REDIS_URL=rediss://default:password@xxxxx.upstash.io:6379
TELEGRAM_BOT_TOKEN=1234567890:ABCdefghijklmnopqrstuvwxyz
```

> **Important:** `SUPABASE_SERVICE_KEY` must be the `service_role` key, NOT the `anon` key. Verify the JWT payload contains `"role": "service_role"`.

### Supabase MCP is Configured

The Supabase MCP server is connected to this project. All agents can:
- Run migrations directly via `supabase_apply_migration`
- Execute SQL via `supabase_execute_sql`
- List tables, check schema, generate types
- No CLI or manual intervention needed from you

### Step 6: Create `.env` File

Create `/Users/elroyjahjaloo/Documents/gomaai_technical_assessment/.env` with:

```bash
# Supabase
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Redis (Upstash TCP)
REDIS_URL=rediss://default:password@xxxxx.upstash.io:6379

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefghijklmnopqrstuvwxyz

# App
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=https://your-frontend.vercel.app
```

> The `CORS_ORIGIN` will be the Vercel URL — fill it in after deploying the frontend in the final phase.

---

## <a id="architecture"></a>2. Architecture Overview

### Hosting Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Vercel     │────▶│    Render    │────▶│    Supabase       │
│  (Frontend)  │     │  (Backend)   │     │  (PostgreSQL)     │
│  React App   │     │  NestJS API  │     │   Free Tier       │
│  Free Tier   │     │  Free Tier   │     │                   │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │                       
                            ├──────────▶ ┌──────────────────┐
                            │            │   Upstash         │
                            │            │  (Redis)          │
                            │            │   Free Tier       │
                            │            └──────────────────┘
                            │
                            ├──────────▶ ┌──────────────────┐
                            │            │   OpenAI          │
                            │            │  (GPT-4o-mini)    │
                            │            └──────────────────┘
                            │
                            └──────────▶ ┌──────────────────┐
                                         │   Telegram        │
                                         │  Bot API          │
                                         │  Free             │
                                         └──────────────────┘
```

**Evaluator flow:**
```
1. Opens Vercel URL → clicks "Connect" 
   → frontend calls GET /api/telegram/status
   → backend calls Telegram getUpdates to find their chat_id
   → stores it, displays "Bot Connected ✅"

2. Drags & drops Excel file → backend validates → queues BullMQ jobs

3. Jobs process via BullMQ worker (in-process on Render):
   → AI generates message → Telegram sends notification
   → Status updates flow back to dashboard
```

### Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | NestJS | Assessment preference, built-in DI, guards, pipes, interceptors, swagger |
| Database | Supabase (hosted PostgreSQL) | Free tier, zero local DB setup |
| ORM | Supabase JS client wrapped in repository pattern | Clean abstraction, no extra dependency |
| Queue | BullMQ + Upstash Redis | Exactly-once semantics, retries built-in, delayed jobs, rate limiting, free tier |
| LLM | OpenAI gpt-4o-mini | Cheap ($0.15/1M input), fast, excellent at structured text |
| Messaging | Telegram Bot API | User preference, reference has working pattern |
| Validation | class-validator + class-transformer | NestJS standard, decorator-based |
| Frontend | React + Vite + Tailwind + shadcn/ui | Beautiful, modern, fast to scaffold |
| Hosting (Backend) | Render Web Service (free) | Native Node.js support, auto-deploy from GitHub |
| Hosting (Frontend) | Vercel (free) | Optimized for React/Vite, instant deploys |
| Logging | Pino | Fastest Node.js logger, structured JSON |
| API Docs | @nestjs/swagger | Auto-generates OpenAPI from decorators |
| Testing | Jest | NestJS default |
| Package Manager | pnpm | Fast, disk-efficient |

### Project Structure

```
gomaai_technical_assessment/
├── .env                          # Secrets (gitignored)
├── .env.example                  # Template
├── docker-compose.yml            # backend + frontend + redis + postgres
├── README.md
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── nest-cli.json
│   ├── Dockerfile
│   ├── test/
│   │   ├── unit/
│   │   │   ├── upload.service.spec.ts
│   │   │   ├── renewal.service.spec.ts
│   │   │   ├── ai.service.spec.ts
│   │   │   ├── telegram.service.spec.ts
│   │   │   └── queue.processor.spec.ts
│   │   ├── integration/
│   │   │   └── renewal.controller.spec.ts
│   │   └── e2e/
│   │       └── app.e2e-spec.ts
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       │
│       ├── config/
│       │   ├── supabase.config.ts
│       │   ├── openai.config.ts
│       │   ├── telegram.config.ts
│       │   ├── redis.config.ts
│       │   └── app.config.ts
│       │
│       ├── common/
│       │   ├── decorators/
│       │   │   └── api-paginated-response.decorator.ts
│       │   ├── filters/
│       │   │   └── http-exception.filter.ts
│       │   ├── interceptors/
│       │   │   ├── logging.interceptor.ts
│       │   │   └── timing.interceptor.ts
│       │   ├── pipes/
│       │   │   └── file-validation.pipe.ts
│       │   └── dto/
│       │       ├── pagination.dto.ts
│       │       └── api-response.dto.ts
│       │
│       ├── database/
│       │   ├── supabase.ts              # Client singleton
│       │   └── migrations/
│       │       ├── 001_create_renewals.sql
│       │       └── 002_create_failed_log.sql
│       │
│       ├── modules/
│       │   ├── upload/
│       │   │   ├── upload.module.ts
│       │   │   ├── upload.controller.ts
│       │   │   ├── upload.service.ts
│       │   │   ├── dto/
│       │   │   │   └── upload-response.dto.ts
│       │   │   └── parsers/
│       │   │       └── excel-parser.service.ts
│       │   │
│       │   ├── renewal/
│       │   │   ├── renewal.module.ts
│       │   │   ├── renewal.controller.ts
│       │   │   ├── renewal.service.ts
│       │   │   ├── dto/
│       │   │   │   ├── renewal-row.dto.ts
│       │   │   │   ├── renewal-filter.dto.ts
│       │   │   │   └── renewal-response.dto.ts
│       │   │   └── repositories/
│       │   │       └── renewal.repository.ts
│       │   │
│       │   ├── ai/
│       │   │   ├── ai.module.ts
│       │   │   ├── ai.service.ts
│       │   │   └── prompts/
│       │   │       └── renewal-reminder.prompt.ts
│       │   │
│       │   ├── queue/
│       │   │   ├── queue.module.ts
│       │   │   ├── queue.service.ts
│       │   │   ├── queue.processor.ts
│       │   │   └── rate-limiter.service.ts
│       │   │
│       │   └── telegram/
│       │       ├── telegram.module.ts
│       │       ├── telegram.service.ts
│       │       └── dto/
│       │           └── send-message.dto.ts
│       │
│       └── supabase/                    # Type definitions from schema
│           └── types.ts
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── index.html
    ├── Dockerfile
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   └── client.ts               # Axios instance
        ├── pages/
        │   ├── Upload.tsx               # Drag-and-drop upload page
        │   └── Dashboard.tsx            # Renewal table with filters
        └── components/
            ├── FileDropZone.tsx
            ├── ValidationResults.tsx
            ├── ErrorReportDownload.tsx
            ├── RenewalTable.tsx
            ├── StatusBadge.tsx
            ├── FilterBar.tsx
            └── Pagination.tsx
```

### Frontend Screens

#### Upload Page (`/`)
```
┌─────────────────────────────────────────────────┐
│  🔄 Policy Renewal Notifications                 │
│  ┌─────────────────────────────────────────────┐ │
│  │  📁 Drag & drop your Excel/CSV file here    │ │
│  │     or click to browse                      │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  ✅ 228 Valid rows                           │ │
│  │  ❌ 7 Invalid rows                           │ │
│  │  📥 [Download Error Report]                  │ │
│  └─────────────────────────────────────────────┘ │
│  Messages queued! 228 notifications pending.     │
└─────────────────────────────────────────────────┘
```

#### Dashboard Page (`/dashboard`)
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Renewals Dashboard                                           │
│  ┌──────────┬──────────┬──────────────────┐                      │
│  │ Status:  │ Adviser: │ Search...        │                      │
│  │ [All  ▼] │ [All  ▼] │                  │                      │
│  └──────────┴──────────┴──────────────────┘                      │
│  ┌───────┬──────────┬──────────┬──────────┬──────────┬──────────┐│
│  │Client │ Policy   │Renewal   │ Premium  │ Adviser  │ Status   ││
│  ├───────┼──────────┼──────────┼──────────┼──────────┼──────────┤│
│  │J. Tan │Elite Life│15/08/26  │ S$2,800  │ S. Lee   │ 🟡 Pend  ││
│  │M. Lim │HealthPlus│20/08/26  │ S$1,500  │ A. Chen  │ 🟢 Sent  ││
│  │K. Ng  │WealthGrow│01/09/26  │ S$5,000  │ S. Lee   │ 🔴 Fail  ││
│  └───────┴──────────┴──────────┴──────────┴──────────┴──────────┘│
│  ◀ 1  2  3  ▶  Showing 10 of 228                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## <a id="database"></a>3. Database Schema

### Table: `renewals`

```sql
CREATE TABLE renewals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name   TEXT NOT NULL,
    policy_name   TEXT NOT NULL,
    renewal_date  DATE NOT NULL,
    premium       DECIMAL(12,2),
    adviser_name  TEXT NOT NULL,
    adviser_phone TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    ai_message    TEXT,
    sent_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    upload_batch  UUID,
    retry_count   INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    hash          TEXT NOT NULL
);

CREATE INDEX idx_renewals_status ON renewals(status);
CREATE INDEX idx_renewals_adviser ON renewals(adviser_name);
CREATE INDEX idx_renewals_date ON renewals(renewal_date);
CREATE UNIQUE INDEX idx_renewals_hash ON renewals(hash);
```

### Table: `upload_batches`

```sql
CREATE TABLE upload_batches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename     TEXT NOT NULL,
    total_rows   INTEGER NOT NULL,
    valid_rows   INTEGER NOT NULL,
    invalid_rows INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `failed_renewals`

```sql
CREATE TABLE failed_renewals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch  UUID REFERENCES upload_batches(id),
    row_number    INTEGER NOT NULL,
    raw_data      JSONB NOT NULL,
    errors        TEXT[] NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `bot_config`

```sql
CREATE TABLE bot_config (
    id             INTEGER PRIMARY KEY DEFAULT 1
        CHECK (id = 1),      -- Single row table
    chat_id        TEXT,      -- Evaluator's Telegram chat ID
    is_connected   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> The `bot_config` table stores exactly one row (id=1). When the evaluator clicks "Connect" on the frontend, the backend calls Telegram `getUpdates` to find the most recent chat_id and stores it here. All notifications go to this chat_id.

### Table: `upload_batches`

```sql
CREATE TABLE upload_batches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename     TEXT NOT NULL,
    total_rows   INTEGER NOT NULL,
    valid_rows   INTEGER NOT NULL,
    invalid_rows INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `failed_renewals`

```sql
CREATE TABLE failed_renewals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch  UUID REFERENCES upload_batches(id),
    row_number    INTEGER NOT NULL,
    raw_data      JSONB NOT NULL,
    errors        TEXT[] NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## <a id="api"></a>4. API Specification

### `GET /api/telegram/status`

**Response (200 — Connected):**
```json
{
  "connected": true,
  "chatId": "123456789"
}
```

**Response (200 — Not Connected):**
```json
{
  "connected": false,
  "instructions": "Open @GomaRenewalsBot on Telegram and click Start, then come back here."
}
```

### `POST /api/renewals/upload`

**Request:** `multipart/form-data`
- `file` — `.xlsx` or `.csv` file

**Response (200):**
```json
{
  "batchId": "uuid",
  "filename": "renewals_july_2026.xlsx",
  "totalRows": 235,
  "validRows": 228,
  "invalidRows": 7,
  "errorReportUrl": "/api/renewals/upload/errors/{batchId}"
}
```

**Validation Rules per Row:**
| Field | Required | Type | Additional |
|-------|----------|------|------------|
| Adviser | Yes | String (1-100) | Not empty |
| Adviser Phone | Yes | String | SG phone format `+65 xxxx xxxx` or `xxxx xxxx` |
| Client | Yes | String (1-100) | Not empty |
| Policy | Yes | String (1-200) | Not empty |
| Renewal Date | Yes | Date | Valid date, not in the past |
| Premium | No | Number | >= 0 if present |

### `GET /api/renewals`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number (1-based) |
| limit | number | 10 | Rows per page (max 100) |
| status | string | — | Filter: pending, processing, sent, failed |
| adviser | string | — | Filter by adviser name (case-insensitive partial match) |
| sortBy | string | renewalDate | Sort column: clientName, policyName, renewalDate, premium, adviserName, status, sentAt |
| sortOrder | string | asc | asc or desc |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "clientName": "John Tan",
      "policyName": "Elite Whole Life",
      "renewalDate": "2026-08-15",
      "premium": 2800,
      "adviserName": "Sarah Lee",
      "status": "sent",
      "sentAt": "2026-07-27T10:30:00Z",
      "createdAt": "2026-07-27T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 228,
    "totalPages": 23
  }
}
```

### `GET /api/renewals/upload/errors/:batchId`

**Response (200):** CSV file download with error details.

### Swagger available at `GET /api/docs`

---

## <a id="data-flow"></a>5. Data Flow (Updated — Cron-Based Sending)

```
User uploads Excel
        │
        ▼
┌─────────────────┐
│ UploadController│  POST /api/renewals/upload
│   (multer)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ UploadService   │  1. Parse file (SheetJS xlsx / csv-parse)
│                 │  2. Normalize dates (serial, DD/MM/YYYY, Month YYYY → YYYY-MM-DD)
│                 │  3. Validate each row (class-validator + SG timezone date check)
│                 │  4. SHA256 hash for dedup
│                 │  5. Insert valid → renewals (status: pending)
│                 │  6. Insert invalid → failed_renewals with error details
│                 │  7. Return summary (NO immediate queue)
└────────┬────────┘
         │
         │  Renewals stored as pending. Nothing sent yet.
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────────────┐    ┌──────────────────────┐
│ Manual:      │    │ Auto: Cron (hourly)  │
│ "Send Now"   │    │ 0 * * * * UTC        │
│ button       │    │                      │
│ POST /process│    │ handleDailyScan()    │
└──────┬───────┘    └──────────┬───────────┘
       │                       │
       │  Both query:          │
       │  SELECT FROM renewals │
       │  WHERE status='pending'│
       │  AND renewal_date <=  │
       │  today + 30 days      │
       │                       │
       └───────┬───────────────┘
               │
               ▼
┌─────────────────┐
│ QueueService    │  BullMQ.addJobs() with delay: 5000,
│                 │  attempts: 3, exponential backoff
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ RenewalProcessor│────▶│ AiService         │
│ (BullMQ Worker) │     │  generateMessage() │
│                 │     │  GPT-4o-mini       │
│ 1. Status guard │     └──────────────────┘
│    (skip if not │              │
│     pending)    │     Returns formatted text
│ 2. Status →     │              │
│    processing   │              ▼
│ 3. Rate limit   │     ┌──────────────────┐
│ 4. AI message   │────▶│ TelegramService   │
│ 5. Telegram send│     │  sendMessage()    │
│ 6. Status →     │     │  POST bot/sendMsg │
│    sent/failed  │     └──────────────────┘
└─────────────────┘
```

**Triple-layer duplicate prevention:**
1. Upload: SHA256 hash → `ON CONFLICT DO NOTHING`
2. Cron: `WHERE status = 'pending'` — sent rows invisible
3. Processor: reads current DB status before sending, skips if not pending

---

## <a id="ai-prompt"></a>6. AI Prompt Strategy

### System Prompt

The prompt must produce consistent, professional messages that match the assessment's example. Key design decisions:

1. **Structured output** — Request exactly the format from the example, no markdown wrapping
2. **Tone guardrails** — Professional, warm, never urgent/pressuring
3. **Edge cases** — Missing premium (omit it), very long names, special characters
4. **No client info leakage** — Never mention sending to client, only adviser-to-client reminder
5. **Emoji usage** — Only the wave emoji, consistent with example
6. **Currency** — Always S$ prefix for Singapore dollars

### Prompt Template (in `src/modules/ai/prompts/renewal-reminder.prompt.ts`):

```typescript
export const RENEWAL_REMINDER_SYSTEM_PROMPT = `You are a professional assistant for a financial advisory firm.
Generate a WhatsApp-style reminder message to an adviser about a client's upcoming policy renewal.

RULES:
1. Use EXACTLY this structure:
   - Greeting: "Hi {adviser's first name} 👋"
   - Body: "Your client {client name} has a policy renewal on {date}."
   - Policy: "Policy: {policy name}"
   - Premium: "Premium: S${amount}" (OMIT this line if premium is null/0/empty)
   - Closing: "Please contact your client before the renewal date."

2. TONE: Professional, warm, helpful. Never alarming or urgent.
3. FORMAT: Plain text. No markdown, no HTML, no bullet points beyond the structure above.
4. LANGUAGE: English only.
5. EMOJI: Only the wave emoji (👋) in the greeting. No other emojis.
6. Never include: phone numbers, links, signatures, or "Best regards".
7. Keep the message concise — maximum 4-5 lines.`;

export const buildRenewalUserPrompt = (data: {
  adviserName: string;
  clientName: string;
  policyName: string;
  renewalDate: string;
  premium: number | null;
}): string => {
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
};
```

### OpenAI Call Configuration:
```typescript
{
  model: 'gpt-4o-mini',
  temperature: 0.3,       // Low for consistency
  max_tokens: 300,
  top_p: 0.9,
}
```

---

## <a id="tasks"></a>7. Task Breakdown & Agent Plan

### Phase 0 — Manual (User)
| # | Task | Time | Depends On |
|---|------|------|------------|
| 0.1 | Create Supabase project | 5 min | — |
| 0.2 | Create OpenAI API key | 2 min | — |
| 0.3 | Create Telegram bot via @BotFather | 3 min | — |
| 0.4 | Get Telegram chat ID | 2 min | 0.3 |
| 0.5 | Install Docker Desktop (if not installed) | — | — |

### Phase 1 — Foundation (Agent: Orchestrator / Me)
| # | Task | Time | Depends On |
|---|------|------|------------|
| 1.1 | Initialize NestJS project with CLI | 5 min | Phase 0 |
| 1.2 | Configure pnpm, tsconfig, eslint, prettier | 5 min | 1.1 |
| 1.3 | Create `.env` / `.env.example` | 2 min | Phase 0 |
| 1.4 | Configure NestJS ConfigModule with env validation | 5 min | 1.3 |
| 1.5 | Create `/backend/src/config/*.config.ts` files | 5 min | 1.4 |
| 1.6 | Create Supabase client singleton (`database/supabase.ts`) | 3 min | 0.1 |
| 1.7 | Create `/backend/src/common/` (filters, interceptors, pipes) | 10 min | 1.1 |
| 1.8 | Write SQL migrations (renewals, upload_batches, failed_renewals) | 5 min | 1.6 |
| 1.9 | Create Docker Compose (redis, backend, frontend) | 10 min | 1.1 |
| 1.10 | Create backend Dockerfile (multi-stage) | 5 min | 1.1 |

### Phase 2 — Backend Modules (Agents A, B, C in parallel)
| # | Task | Agent | Time | Depends On |
|---|------|-------|------|------------|
| 2.1 | Upload module: controller + service + excel-parser + validation DTOs | Agent A | 20 min | Phase 1 |
| 2.2 | Renewal module: entity + repository + controller + dashboard API + DTOs | Agent B | 20 min | Phase 1, 1.8 |
| 2.3 | Swagger setup: all controller decorators | Agent B | 5 min | 2.2 |
| 2.4 | AI module: OpenAI service + prompt templates | Agent C | 15 min | Phase 1 |
| 2.5 | Queue module: BullMQ setup + producer + processor + rate limiter | Agent C | 15 min | Phase 1, 1.9 |

### Phase 3 — Integration (Agents D, E in parallel)
| # | Task | Agent | Time | Depends On |
|---|------|-------|------|------------|
| 3.1 | Telegram module: send service + error handling + retry logic | Agent D | 15 min | Phase 1, reference code |
| 3.2 | Wire queue processor to AI + Telegram services | Agent E | 10 min | 2.4, 2.5, 3.1 |
| 3.3 | Create app.module.ts with all modules wired | Agent E | 5 min | 2.1–3.1 |

### Phase 4 — Frontend (Agent F)
| # | Task | Agent | Time | Depends On |
|---|------|-------|------|------------|
| 4.1 | Scaffold Vite + React + Tailwind + shadcn | Agent F | 5 min | — |
| 4.2 | Upload page: drag-drop + validation display + error download | Agent F | 20 min | Phase 2 |
| 4.3 | Dashboard page: table + filters + pagination + status badges | Agent F | 20 min | Phase 2 |
| 4.4 | API client layer (axios instance with types) | Agent F | 5 min | Phase 2 |
| 4.5 | Frontend Dockerfile | Agent F | 3 min | 4.1 |

### Phase 5 — Polish (Agents G, H in parallel)
| # | Task | Agent | Time | Depends On |
|---|------|-------|------|------------|
| 5.1 | Unit tests: upload.service, renewal.service, ai.service, telegram.service, queue.processor | Agent G | 25 min | Phase 2–3 |
| 5.2 | Integration test: renewal.controller (upload + dashboard) | Agent G | 10 min | Phase 3 |
| 5.3 | README: setup, assumptions, architecture, trade-offs, improvements | Agent H | 15 min | All |
| 5.4 | Verify Docker Compose end-to-end | Agent H | 10 min | Phase 4 |

### Total Estimated Time
| Phase | Time |
|-------|------|
| Phase 0 (Manual) | 12 min |
| Phase 1 (Foundation) | 40 min |
| Phase 2 (Modules parallel) | 20 min |
| Phase 3 (Integration parallel) | 15 min |
| Phase 4 (Frontend) | 53 min |
| Phase 5 (Polish parallel) | 25 min |
| **Total** | **~2h 45min** |

### Agent Summary

| Agent | Responsibility | Files |
|-------|---------------|-------|
| **Orchestrator (Me)** | Phase 1 foundation + Phase 3 integration oversight + final review | All config, common, database, docker-compose, app.module |
| **Agent A** | Upload module | `modules/upload/**`, `common/pipes/file-validation.pipe.ts` |
| **Agent B** | Renewal module + Swagger | `modules/renewal/**`, swagger setup |
| **Agent C** | AI + Queue modules | `modules/ai/**`, `modules/queue/**` |
| **Agent D** | Telegram module | `modules/telegram/**` |
| **Agent E** | Integration wiring | `app.module.ts`, queue processor wiring |
| **Agent F** | Frontend React app | `frontend/**` |
| **Agent G** | Tests | `backend/test/**` |
| **Agent H** | README + final verification | `README.md`, `docker-compose.yml` review |

---

## <a id="manifest"></a>8. File Manifest

### Backend Files (41 files)

```
backend/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── supabase.config.ts
│   │   ├── openai.config.ts
│   │   ├── telegram.config.ts
│   │   ├── redis.config.ts          # Uses REDIS_URL
│   │   └── app.config.ts
│   ├── common/
│   │   ├── decorators/api-paginated-response.decorator.ts
│   │   ├── filters/http-exception.filter.ts
│   │   ├── interceptors/logging.interceptor.ts
│   │   ├── interceptors/timing.interceptor.ts
│   │   ├── pipes/file-validation.pipe.ts
│   │   └── dto/
│   │       ├── pagination.dto.ts
│   │       └── api-response.dto.ts
│   ├── database/
│   │   ├── supabase.ts
│   │   └── migrations/
│   │       ├── 001_create_renewals.sql
│   │       └── 002_create_failed_log.sql
│   └── modules/
│       ├── upload/
│       │   ├── upload.module.ts
│       │   ├── upload.controller.ts
│       │   ├── upload.service.ts
│       │   ├── dto/upload-response.dto.ts
│       │   └── parsers/excel-parser.service.ts
│       ├── renewal/
│       │   ├── renewal.module.ts
│       │   ├── renewal.controller.ts
│       │   ├── renewal.service.ts
│       │   ├── dto/
│       │   │   ├── renewal-row.dto.ts
│       │   │   ├── renewal-filter.dto.ts
│       │   │   └── renewal-response.dto.ts
│       │   └── repositories/renewal.repository.ts
│       ├── ai/
│       │   ├── ai.module.ts
│       │   ├── ai.service.ts
│       │   └── prompts/renewal-reminder.prompt.ts
│       ├── queue/
│       │   ├── queue.module.ts
│       │   ├── queue.service.ts
│       │   ├── queue.processor.ts
│       │   └── rate-limiter.service.ts
│       └── telegram/
│           ├── telegram.module.ts
│           ├── telegram.controller.ts   # Bot activation endpoint
│           ├── telegram.service.ts
│           └── dto/send-message.dto.ts
└── test/
    ├── unit/
    │   ├── upload.service.spec.ts
    │   ├── renewal.service.spec.ts
    │   ├── ai.service.spec.ts
    │   ├── telegram.service.spec.ts
    │   └── queue.processor.spec.ts
    └── integration/
        └── renewal.controller.spec.ts
```

### Frontend Files (15 files)

```
frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── components.json
└── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/client.ts
        ├── pages/
        │   ├── Upload.tsx
        │   └── Dashboard.tsx
        └── components/
            ├── BotConnection.tsx        # Connect Telegram button + status
            ├── FileDropZone.tsx
            ├── ValidationResults.tsx
            ├── ErrorReportDownload.tsx
            ├── RenewalTable.tsx
            ├── StatusBadge.tsx
            ├── FilterBar.tsx
            └── Pagination.tsx
```

### Root Files (3 files)

```
.env.example
vercel.json
README.md
```

**Total: ~60 files**

---

## <a id="env-vars"></a>9. Environment Variables

## <a id="env-vars"></a>9. Environment Variables

### `.env` (gitignored — local dev only)
```bash
# ── Supabase
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJh...

# ── OpenAI
OPENAI_API_KEY=sk-...

# ── Redis (Upstash)
REDIS_URL=rediss://default:password@xxxxx.upstash.io:6379

# ── Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...

# ── App
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
TZ=Asia/Singapore
```

### `.env.example` (committed to repo)
```bash
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
REDIS_URL=
TELEGRAM_BOT_TOKEN=
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
TZ=Asia/Singapore
```

### Render Environment Variables (copy all of these)
```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
OPENAI_API_KEY=sk-proj-...
REDIS_URL=rediss://default:password@xxxxx.upstash.io:6379
TELEGRAM_BOT_TOKEN=1234567890:ABCdefghijklmnopqrstuvwxyz
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=https://your-frontend.vercel.app
TZ=Asia/Singapore
```

### Vercel Environment Variable (just one)
```
VITE_API_URL=https://goma-backend.onrender.com/api
```

### Vercel Environment Variable (just one)
```
VITE_API_URL=https://goma-backend.onrender.com/api
```

---

## <a id="checklist"></a>10. Master Checklist

### ☐ Phase 0 — Credentials
- [x] 0.1 Supabase project created → `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` saved (service_role key)
- [x] 0.2 OpenAI API key created → `OPENAI_API_KEY` saved
- [x] 0.3 Upstash Redis created → `REDIS_URL` saved (rediss:// TCP URL)
- [x] 0.4 Telegram bot created via @BotFather → `TELEGRAM_BOT_TOKEN` saved
- [x] 0.5 `.env` file created in project root with all 5 variables
- [x] 0.6 Old Supabase tables cleaned up
- [x] 0.7 Supabase MCP configured for agent migrations

### ☐ Phase 1 — Foundation
- [ ] 1.1 NestJS project scaffolded (`nest new backend`)
- [ ] 1.2 Dependencies installed (supabase-js, openai, bullmq, ioredis, xlsx, csv-parse, multer, pino, etc.)
- [ ] 1.3 `.env.example` created
- [ ] 1.4 NestJS ConfigModule with Joi validation
- [ ] 1.5 All config files created (supabase, openai, telegram, redis, app)
- [ ] 1.6 Supabase client singleton created
- [ ] 1.7 SQL migrations written (auto-run on bootstrap)
- [ ] 1.8 Common module (filters, interceptors, pipes) created
- [ ] 1.9 Redis connection verified (ioredis → Upstash)

### ☐ Phase 2 — Backend Modules
- [ ] 2.1 Upload module complete (controller, service, parser)
  - [ ] XLSX parsing works (SheetJS/xlsx)
  - [ ] CSV parsing works (csv-parse)
  - [ ] Row validation with class-validator + manual row-level validation
  - [ ] Hash-based duplicate detection (SHA256 of row content)
  - [ ] Valid rows → renewals table (status: pending)
  - [ ] Invalid rows → failed_renewals table with error list
  - [ ] Error report endpoint: `GET /api/renewals/errors/:batchId` returns CSV
- [ ] 2.2 Renewal module complete (controller, service, repository)
  - [ ] `GET /api/renewals` with pagination (page + limit)
  - [ ] `?status=` filter (pending | processing | sent | failed)
  - [ ] `?adviser=` filter (case-insensitive partial match)
  - [ ] `?sortBy=` and `?sortOrder=` support
  - [ ] Response includes pagination metadata (total, totalPages)
- [ ] 2.3 Swagger decorators on all controllers
  - [ ] OpenAPI UI at `GET /api/docs`
- [ ] 2.4 AI module complete
  - [ ] OpenAI client configured (from env)
  - [ ] System prompt + user prompt templates
  - [ ] `generateMessage()` returns formatted WhatsApp-style message
  - [ ] Handles missing/null premium (omits the line)
  - [ ] Handles edge cases (long names, special characters)
- [ ] 2.5 Queue module complete
  - [ ] BullMQ queue registered (using Upstash Redis URL via ioredis)
  - [ ] `addRenewalJobs()` creates delayed jobs (5s buffer after upload)
  - [ ] Queue processor skeleton ready
  - [ ] Rate limiter (token bucket) implemented in processor

### ☐ Phase 3 — Integration
- [ ] 3.1 Telegram module complete
  - [ ] `sendMessage()` adapted from reference `sendTelegramNotification()`
  - [ ] Sends to stored chat_id
  - [ ] Error handling: logs failures, throws for queue retry
  - [ ] Bot activation endpoint: `GET /api/telegram/status`
  - [ ] Auto-detects chat ID via Telegram `getUpdates` API
  - [ ] Stores detected chat_id in a `bot_config` table
- [ ] 3.2 Queue processor wired to AI + Telegram
  - [ ] Processor calls AI → generates message
  - [ ] Processor calls Telegram → sends message
  - [ ] Processor updates renewal: status → 'sent', sent_at → Now()
  - [ ] On failure: status → 'failed', retry_count++, last_error stored
  - [ ] Max 3 retries with exponential backoff (1min, 5min, 15min)
- [ ] 3.3 App module with all modules wired
  - [ ] NestJS boots without errors
  - [ ] `pnpm run start:dev` works locally
  - [ ] Migrations auto-run on bootstrap

### ☐ Phase 4 — Frontend
- [ ] 4.1 Vite + React + Tailwind + shadcn/ui scaffolded
- [ ] 4.2 Bot connection flow
  - [ ] "Connect Telegram" button on homepage
  - [ ] Instructions: "Open @GomaRenewalsBot on Telegram and click Start"
  - [ ] Polls backend for chat_id detection
  - [ ] Shows "Connected ✅" on success
- [ ] 4.3 Upload page complete
  - [ ] Drag-and-drop file zone (react-dropzone)
  - [ ] File type validation (.xlsx, .csv only, max 10MB)
  - [ ] Upload progress bar
  - [ ] Validation results display (green valid count, red invalid count)
  - [ ] Error report download button (CSV with row-by-row errors)
  - [ ] Success state: "228 notifications queued!"
  - [ ] Responsive design (mobile-friendly)
- [ ] 4.4 Dashboard page complete
  - [ ] Table columns: Client, Policy, Renewal Date, Premium, Adviser, Status, Sent At
  - [ ] Status filter dropdown (All | Pending | Processing | Sent | Failed)
  - [ ] Adviser search input (debounced)
  - [ ] Column sorting (click header to toggle asc/desc)
  - [ ] Pagination controls (prev/next + page numbers)
  - [ ] Status badge colors: pending=yellow, processing=blue, sent=green, failed=red
  - [ ] Empty state: illustration + "No renewals found"
  - [ ] Loading skeleton state
  - [ ] Responsive design
- [ ] 4.5 API client layer configured (axios + base URL from VITE_API_URL env var)

### ☐ Phase 5 — Polish
- [ ] 5.1 Unit tests (at least 15 tests)
  - [ ] upload.service.spec.ts (parse + validate + dedup)
  - [ ] renewal.service.spec.ts (CRUD + filtering)
  - [ ] ai.service.spec.ts (prompt building + API call mock)
  - [ ] telegram.service.spec.ts (send + chat ID detection)
  - [ ] queue.processor.spec.ts (job flow + retries + rate limiting)
- [ ] 5.2 E2E/integration tests
  - [ ] Upload endpoint returns correct response
  - [ ] Dashboard endpoint returns filtered/paginated results
  - [ ] Telegram status endpoint returns connected/disconnected
- [ ] 5.3 README written with all required sections
  - [ ] Setup instructions
  - [ ] Assumptions
  - [ ] Architecture diagram/explanation
  - [ ] Trade-offs
  - [ ] Future improvements
- [ ] 5.4 Deploy backend to Render
  - [ ] Connect GitHub repo → create web service
  - [ ] Set all 9 env vars
  - [ ] Verify health endpoint works
  - [ ] Verify Swagger docs at `/api/docs`
  - [ ] Verify Redis connection in Render logs
- [ ] 5.5 Deploy frontend to Vercel
  - [ ] Import GitHub repo → set VITE_API_URL
  - [ ] Verify connection to backend
  - [ ] Update Render CORS_ORIGIN to Vercel URL

### ☐ Final Verification
- [ ] All tests pass (`pnpm test`)
- [ ] Linter passes (`pnpm run lint`)
- [ ] No TypeScript errors (`pnpm run build`)
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` lists all required vars
- [ ] No secrets committed to repo
- [ ] Git repo initialized, all code committed
- [ ] GitHub repository created and pushed
- [ ] Both deployments live and working
- [ ] Test: upload sample XLSX → see notification on Telegram

---

## <a id="testing"></a>11. Testing Strategy

### Unit Tests (Jest)
- Mock Supabase client with jest.fn()
- Mock OpenAI API with nock or jest.mock
- Mock Telegram HTTP calls
- Test validation edge cases (empty fields, invalid phone, past dates)
- Test duplicate detection logic
- Test pagination math
- Test AI prompt assembly (no API call needed)
- Test rate limiter token bucket

### Key Test Cases
```typescript
describe('UploadService', () => {
  it('should parse valid XLSX and return row count');
  it('should reject missing adviser name');
  it('should reject invalid phone format');
  it('should reject past renewal date');
  it('should accept missing premium as valid');
  it('should detect duplicate rows via hash');
  it('should insert valid rows into database');
  it('should insert invalid rows with error messages');
});

describe('RenewalService', () => {
  it('should return paginated results');
  it('should filter by status');
  it('should filter by adviser (partial match)');
  it('should sort by renewalDate');
  it('should handle empty result set');
});

describe('AiService', () => {
  it('should include premium line when present');
  it('should omit premium line when null');
  it('should format renewal date correctly');
  it('should call OpenAI with correct temperature');
});

describe('QueueProcessor', () => {
  it('should process job and update status to sent');
  it('should retry on failure');
  it('should mark failed after max retries');
  it('should respect rate limiter');
});
```

---

## <a id="deployment"></a>12. Deployment (Render + Vercel)

### Backend — Render Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Connect your GitHub repo
3. Configure:
   - **Name:** `goma-backend`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `pnpm install && pnpm run build`
   - **Start Command:** `node dist/main.js`
   - **Region:** Singapore (`ap-southeast-1`)
4. Add **Environment Variables** (copy-paste from your `.env`):
   ```
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
   OPENAI_API_KEY=sk-proj-...
   UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=xxxxx
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefghijklmnopqrstuvwxyz
   NODE_ENV=production
   PORT=3000
   LOG_LEVEL=info
   CORS_ORIGIN=https://your-frontend.vercel.app
   ```
5. Click **Create Web Service**
6. Note the URL (e.g. `https://goma-backend.onrender.com`)

### Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import the GitHub repo
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `pnpm run build`
   - **Output Directory:** `dist`
4. Add **Environment Variable**:
   ```
   VITE_API_URL=https://goma-backend.onrender.com/api
   ```
5. Click **Deploy**
6. Note the URL (e.g. `https://goma-renewals.vercel.app`)
7. **Go back to Render** → update `CORS_ORIGIN` to the Vercel URL → **Save & Deploy**

### Render Cold Start Fix

Render free tier sleeps after 15 minutes of inactivity. The frontend handles this automatically:
- On page load, pings `GET /api/health`
- Shows "Waking up server... please wait" with a spinner
- Polls every 3 seconds until backend responds
- Transparent to the evaluator — takes ~30-45s on first visit

### Automated DB Migration on Startup

The backend runs migrations on `main.ts` bootstrap before listening on the port:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Run migrations automatically
  await runMigrations();
  await app.listen(3000);
}
```

This means the evaluator never runs a CLI command. Tables are created on first deploy.

---

## <a id="readme"></a>13. README Outline

```markdown
# Goma AI — Policy Renewal Notification Agent

## Setup
1. Prerequisites (Supabase, OpenAI, Telegram Bot)
2. Clone + env
3. Docker Compose up
4. Apply database migrations
5. Access frontend at http://localhost:5173

## Architecture
- NestJS modular monolith
- BullMQ background queue with Redis
- AI-generated messages via OpenAI gpt-4o-mini
- Telegram Bot API for delivery
- React + Tailwind frontend

## Assumptions
- Singapore phone format
- All dates in SG timezone
- Single Telegram bot for all advisers
- Adviser chat_id stored per renewal
- Excel columns match exact header names

## Trade-offs
- Supabase JS client over TypeORM (faster setup, less DI integration)
- In-process queue worker (OK for prototype, would split for production)
- Mock WhatsApp via Telegram (meets assessment's mock requirement)
- Single rate limiter instance (not distributed)

## Improvements (for production)
- Redis-based distributed rate limiting
- Separate worker process for queue
- Webhook endpoint for delivery receipts
- Admin UI for manual retry
- Scheduled cron for recurring monthly uploads
- Row-level security on renewals table
- API key authentication
```

---

## Key Design Principles

1. **Fail Loud, Recover Gracefully** — Validate early, log everything, retry intelligently
2. **Separation of Concerns** — Each module has ONE responsibility
3. **Repository Pattern** — All DB access through repositories, not raw queries in services
4. **Immutable DTOs** — readonly interfaces for all request/response types
5. **No Magic Strings** — Status enums, error codes, config keys all typed
6. **Secure by Default** — `.env` gitignored, no secrets in code, input sanitization, class-validator whitelist
7. **Observable** — Pino structured logs with request IDs, timing interceptor on all routes
