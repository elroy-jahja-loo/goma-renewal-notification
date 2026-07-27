# Goma AI — Policy Renewal Notification Agent

An internal automation tool for financial advisory companies. Operations teams upload monthly policy renewal spreadsheets via a web UI, and the system automatically generates AI-crafted reminder messages delivered to advisers via Telegram.

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://goma-frontend.vercel.app |
| Backend API | https://goma-backend.onrender.com/api |
| API Docs | https://goma-backend.onrender.com/api/docs |
| Telegram Bot | `@renewal_notification_agent_bot` |

**Demo credentials:** `user@example.com` / `password`

> **Note on Render free tier:** The backend sleeps after 15 minutes of inactivity. To keep it awake for the demo, a free [UptimeRobot](https://uptimerobot.com) monitor pings the health endpoint every 5 minutes. On first visit after sleep, the frontend shows "Waking up server..." for 30-45 seconds, then everything works normally.

## Quick Start

### Option A — Use the Live Demo (No Setup)

1. Open `@renewal_notification_agent_bot` on Telegram → click **Start**
2. Go to https://goma-frontend.vercel.app → log in → click **Connect Telegram**
3. Upload your Excel/CSV file → click **Send All Pending**
4. Telegram notifications arrive within seconds

### Option B — Docker Compose (Local)

```bash
cp .env.example .env
# Fill in your Supabase URL, Supabase service key, OpenAI key, and Telegram bot token
docker compose up
# Frontend: http://localhost:5173 | API: http://localhost:3000
```

**Environment variables needed:**
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...          # service_role key (not anon)
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=1234567890:ABC...
```

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

### Core Data Flow

1. **Upload** — Operations team drags-and-drops Excel/CSV into the web UI
2. **Parse** — SheetJS (XLSX) or csv-parse (CSV) extracts rows. Headers matched case-insensitively. Dates auto-normalized from multiple formats (Excel serial, DD/MM/YYYY, text months) to YYYY-MM-DD
3. **Validate** — Each row checked: required fields (Adviser, Phone, Client, Policy, Date), Singapore phone format, date not in past (Singapore timezone), premium optional but must be ≥0 if present
4. **Store** — Valid rows → PostgreSQL (`status: pending`). Invalid rows → `failed_renewals` with downloadable error report CSV showing row number, field, original value, and plain-English error message
5. **Queue** — On upload, renewals stored but NOT sent immediately. Manual "Send All Pending" button or automated cron (`*/30 * * * *`) scans for pending renewals within 30 days and enqueues them to BullMQ
6. **Process** — BullMQ worker picks up job → rate-limited (20/sec token bucket) → AI generates professional WhatsApp-style message via GPT-4o-mini → delivered via Telegram Bot API to the adviser
7. **Track** — Status flows: `pending` → `processing` → `sent` | `failed`. Failed jobs auto-retry 3x with exponential backoff (60s → 300s → 900s)

### Duplicate Prevention (Three Layers)

1. **Upload hash** — SHA256(client+policy+date+adviser) lowercase → `ON CONFLICT DO NOTHING` at DB level
2. **Scan filter** — Cron only queries `WHERE status = 'pending'` — sent rows invisible
3. **Processor guard** — Reads current DB status before sending — skips if already `processing` or `sent`

> **Known limitation:** The hash formula uses (client, policy, date, adviser) only. If the same client-policy-date combo appears with a different phone number or premium, it's treated as a duplicate. For monthly batch uploads with consistent source data, this works correctly. A more comprehensive hash would include phone and premium for production use.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | NestJS + TypeScript | Modular DI, built-in validation, Swagger |
| Frontend | React + Vite + Tailwind CSS | Fast, beautiful, shadcn/ui components |
| Database | PostgreSQL (Supabase free tier) | Serverless, zero migration CLI needed |
| Queue | BullMQ + Redis (Upstash free tier) | Exactly-once semantics, retries, rate limiting |
| AI | OpenAI GPT-4o-mini | Cheap ($0.15/1M tokens), consistent structured output |
| Messaging | Telegram Bot API | Free, token-based auth, no business verification needed |
| Hosting | Render + Vercel (free tiers) | Zero cost, auto-deploy from GitHub |

## API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/renewals/upload` | Required | 3 req/s | Upload Excel/CSV file (max 10MB, 10,000 rows) |
| POST | `/api/renewals/process` | Required | 5 req/s | Trigger immediate processing of pending renewals within 30 days |
| GET | `/api/renewals` | Required | 20 req/10s | List renewals with pagination, filtering, sorting |
| GET | `/api/renewals/errors/:batchId` | Required | 20 req/10s | Download error report CSV |
| GET | `/api/telegram/status` | Public | — | Check bot connection status |
| POST | `/api/telegram/connect` | Public | — | Auto-detect bot chat ID |
| GET | `/api/docs` | Public | — | Swagger/OpenAPI UI |

**Query parameters for `GET /api/renewals`:** `?page=1&limit=10&status=pending&adviser=Sarah&sortBy=renewalDate&sortOrder=asc`

## Excel Parsing & Validation

### Supported Date Formats (Auto-Normalized to YYYY-MM-DD)

| Input | Example | Output |
|-------|---------|--------|
| ISO | `2026-08-15` | `2026-08-15` |
| Excel serial | `46221` | `2026-08-15` |
| DD/MM/YYYY | `15/08/2026` | `2026-08-15` |
| DD-MM-YYYY | `15-08-2026` | `2026-08-15` |
| D.M.YYYY | `15.08.2026` | `2026-08-15` |
| Text month | `15 August 2026` | `2026-08-15` |
| Abbreviated | `15 Aug 2026` | `2026-08-15` |

### Column Mapping (Case-Insensitive)

Headers are matched fuzzily to handle common variations. The user's spreadsheet can use any of these:

| Recognized Headers | Maps To |
|-------------------|---------|
| Adviser, adviser, ADVISER | `adviser` |
| Adviser Phone, adviser_phone, adviserphone | `adviserPhone` |
| Client, client | `client` |
| Policy, policy | `policy` |
| Renewal Date, renewal_date, renewaldate | `renewalDate` |
| Premium, premium | `premium` |

### Validation Rules (Per Row)

| Field | Rule | Error Message (User) |
|-------|------|---------------------|
| Adviser | Required, max 100 chars, not blank | "Adviser name is required" |
| Adviser Phone | Required, SG format | "Phone number is not a valid Singapore number. Use: +65 9123 4567" |
| Client | Required, max 100 chars, not blank | "Client name is required" |
| Policy | Required, max 200 chars, not blank | "Policy name is required" |
| Renewal Date | Required, YYYY-MM-DD, not in past | "Date is not in a valid format. Use YYYY-MM-DD" or "This date is in the past" |
| Premium | Optional, must be ≥0 | "Premium cannot be negative" or "Premium must be a number" |

### File-Level Validation (Before Processing Any Rows)

| Check | Error Message (User) |
|-------|---------------------|
| No file selected | "No file was selected. Please choose a .xlsx or .csv file to upload." |
| Wrong file type | `"filename.pdf" is not a supported file type. Please upload .xlsx, .xls, or .csv.` |
| File too large (>10MB) | `"File is too large (12.3 MB). Maximum file size is 10 MB."` |
| Corrupted file | "This file is not a valid Excel file. It may be corrupted." |
| No sheets in workbook | "The uploaded Excel file has no worksheets." |
| Headers but no data | "The spreadsheet has headers but no data rows." |
| No recognized columns | "No recognized columns found. Your file must have columns named: Adviser, Adviser Phone, Client, Policy, Renewal Date." |
| Over 10,000 rows | `"This file contains 12,345 rows. The maximum is 10,000 rows."` |

## AI Prompt Strategy

The system uses a custom-authored prompt (`backend/src/modules/ai/prompts/renewal-reminder.prompt.ts`) that ensures:

- **Consistent structure** — Every message follows the same format with blank line separation between sections
- **Professional tone** — Warm but never alarming or urgent
- **Graceful handling** — Missing premium data omits the line entirely (no "S$0" or "N/A")
- **Plain text only** — No markdown, HTML, or rich formatting
- **Minimal emoji** — Wave emoji (👋) in greeting only
- **No extraneous content** — No signatures, links, phone numbers, or closing pleasantries

**Temperature set to 0.3** for consistency across all messages. GPT-4o-mini chosen for cost efficiency ($0.15/1M input tokens) while maintaining excellent structured text generation.

## Cron Scheduling

- **Pattern:** `*/5 * * * *` (every 5 minutes, UTC)
- **Behavior:** Scans for pending renewals where `renewal_date ≤ today + 30 days`
- **Reliability:** Repeatable job config stored in Upstash Redis. Survives Render hibernation (Queue reconnects on wake)
- **Idempotent:** Only picks `status: 'pending'` — sent rows are invisible to future scans
- **Manual override:** "Send All Pending" button on Dashboard triggers the exact same scan immediately

## Rate Limiting

| Scope | Limit | Rationale |
|-------|-------|-----------|
| Upload (POST) | 3 req/s | Prevent DoS on file parsing and DB writes |
| Process (POST) | 5 req/s | Allow burst sends after upload |
| Dashboard (GET) | 20 req/10s | Generous for UI polling |
| Telegram API | 20 msg/s (token bucket) | Telegram allows ~30/s — safe margin |

Two separate rate limiters serve different purposes: `ThrottlerModule` (NestJS) protects our HTTP endpoints from abuse, while the custom token bucket protects Telegram's external API rate limit.

## Testing

```bash
cd backend
pnpm test          # 29 unit + integration tests
pnpm test:cov      # Coverage report
```

All tests mock external dependencies (Supabase, OpenAI, Telegram, Redis) to test logic in isolation without requiring real API keys.

## Security

| Protection | Implementation |
|-----------|---------------|
| Authentication | JWT via Supabase Auth (shared `bot_config` table) |
| SQL injection | All queries via Supabase parameterized client — no raw SQL |
| XSS | React auto-escapes, DTO `whitelist: true` strips unknown fields |
| Row-Level Security | Enabled on all 4 tables, service_role-only access |
| Input sanitization | All fields trimmed, whitespace-only rejected, `@IsNotEmpty` on required fields |
| Infinity/NaN guard | `isFinite()` check on premium before DB insert |
| XML bomb (XLSX) | `sheetRows: 10001`, `cellFormula: false`, `cellStyles: false` on SheetJS |
| Malicious files | PK magic byte check (XLSX must start with `0x50`) |
| File size limit | 10MB maximum |
| Row count limit | 10,000 rows per file |
| Rate limiting | 3-tier `ThrottlerModule` on all endpoints |
| Secrets | `.env` gitignored, `.env.example` committed with empty values, no hardcoded keys |

> **Known limitation:** Telegram `/status` and `/connect` endpoints are public (no auth). For this prototype with a private bot username, the risk is minimal. Production would add JWT auth to these endpoints.

## Assumptions

1. **Singapore context** — Phone numbers follow SG format (`+65 xxxx xxxx` or `xxxx xxxx`). All dates and times in `Asia/Singapore` timezone (`TZ=Asia/Singapore`)
2. **Single recipient** — All notifications go to one Telegram chat ID (auto-detected on first connect). The `bot_config` table stores the last connected chat. For production, per-adviser routing would store one chat ID per adviser
3. **Monthly batch** — Operations exports a complete list each month. The system does not handle incremental/delta uploads (validated rows from previous uploads are deduplicated via hash)
4. **30-day notification window** — Renewals within 30 days of the current date are eligible for notification. This aligns with MAS Fair Dealing Guidelines (minimum 14 days for policy renewal notices) and industry practice of providing advisers adequate time for client consultation before the renewal date
5. **Notifications to advisers only** — The system never sends to clients (as specified in the assessment)
6. **Excel headers** — Columns matched case-insensitively using fuzzy header mapping (see table above). Dates auto-normalized from common formats
7. **Hash dedup scope** — Deduplication uses SHA256(client + policy + date + adviser). For prototype speed, phone and premium are excluded from the hash. Monthly batch data is consistent enough that this is sufficient

## Architecture Decisions & Trade-offs

### Telegram over WhatsApp (Messaging)
Telegram Bot API was chosen because it requires no business verification, uses simple token-based auth, and is completely free. This enables rapid prototyping and zero-cost iteration — ideal for a 6-hour assessment. The `TelegramService.send()` function fulfills the same role as the required `WhatsAppService.send()` — mock implementation is explicitly permitted by the assessment.

### Supabase Client over TypeORM/Prisma (Database)
Direct Supabase JS client with repository pattern avoids migration CLI dependencies. Trade-off: manual snake_case ↔ camelCase column mapping instead of decorator-based entities. For a rapid prototype with a small schema, this is more productive than configuring a full ORM.

### BullMQ In-Process Worker (Queue)
Worker runs within the same NestJS process for simplicity. Trade-off: scaling beyond a single Render instance requires splitting to a separate worker process. On Render's free 512MB instance, the combined API + Worker footprint is well within limits. BullMQ provides exactly-once semantics, 3x retry with exponential backoff, and rate limiting out of the box.

### Cron-Triggered Sending (Not Immediate Queue)
Upload stores renewals as `pending` without sending. A "Send All Pending" button provides instant gratification for demos. The cron fires every 5 minutes as the automated path. Trade-off: adds a UX step, but guarantees no duplicate sends and gives the user control over timing. The cron pattern survives Render hibernation since the repeatable job config is stored in Upstash Redis.

### Raw BullMQ over @nestjs/bull (Dependency Injection)
Direct `new Queue()` and `new Worker()` were used instead of NestJS's `@nestjs/bull` wrapper. Trade-off: slightly less idiomatic DI, but avoids an extra dependency and gives full control over BullMQ 5.x features.

### Two Separate Rate Limiters
`ThrottlerModule` protects our HTTP endpoints (external attack surface). The custom token bucket (rate-limiter.service.ts) protects Telegram's API rate limit (external service constraint). They serve different services — our API vs Telegram's API — and operate at different granularities.

### In-Memory Rate Limiter Token Bucket
The Telegram rate limiter uses an in-memory token bucket (20 tokens/sec). Trade-off: not distributed — OK for a single Render instance. For multi-instance production, a Redis-based rate limiter would be needed.

### Free-Tier Hosting with Cold Start
Render's free tier sleeps after 15 minutes of inactivity. The frontend handles this transparently by displaying "Waking up server..." and polling until the backend responds (typically 30-45 seconds). For the evaluator's demo, opening the URL one minute before starting is recommended. This known limitation is purely about the hosting tier, not the application architecture.

## Improvements (Ranked by Business Value)

1. **Per-adviser Telegram routing** — Store one chat ID per adviser (from the Excel data), route each notification to the correct adviser. This turns the prototype into a production-ready tool
2. **Configurable notification window** — Different insurance products need different lead times. An env-configurable `RENEWAL_WINDOW_DAYS` would support 14/30/60-day windows per product type
3. **Email fallback via Resend** — If Telegram delivery fails after 3 retries, send the notification via email to ensure zero missed renewals
4. **Full end-to-end test suite** — HTTP-level tests against a running instance for production deployment confidence
5. **CSV/Excel template download** — "Download Template" button on the Upload page with exact headers reduces onboarding friction for the operations team
6. **Separate worker process** — Deploy the BullMQ Worker as an independent Render service for isolated scaling
7. **Redis-based distributed rate limiting** — Replace the in-memory token bucket with a Redis-backed limiter for multi-instance deployments

## License

MIT
