# Goma AI — Policy Renewal Notification Agent

An internal automation tool for financial advisory companies. Operations teams upload monthly policy renewal spreadsheets via a web UI, and the system automatically generates AI-crafted reminder messages delivered to advisers via Telegram.

---

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://goma-frontend.vercel.app |
| Backend API | https://goma-backend.onrender.com/api |
| API Docs | https://goma-backend.onrender.com/api/docs |
| Telegram Bot | `@renewal_notification_agent_bot` |

**Demo credentials:** `user@example.com` / `password`

> **Note on Render free tier:** The backend sleeps after 15 minutes of inactivity. A free [UptimeRobot](https://uptimerobot.com) monitor pings the health endpoint every 5 minutes to keep it awake. On first visit after sleep, the frontend shows "Waking up server..." for 30-45 seconds, then everything works normally.

---

## 1. Setup

### Option A — Live Demo (No Setup Required)

1. Open `@renewal_notification_agent_bot` on Telegram → click **Start**
2. Go to https://goma-frontend.vercel.app → log in → click **Connect Telegram**
3. Upload your Excel/CSV file → notifications arrive automatically

### Option B — Docker Compose (Local)

```bash
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN
# Redis runs locally in a container — no Upstash account needed
docker compose up
# Frontend: http://localhost:5173 | API: http://localhost:3000 | Swagger: http://localhost:3000/api/docs
```

### Environment Variables

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...                  # service_role key (not anon)
OPENAI_API_KEY=sk-...
REDIS_URL=rediss://default:...               # Upstash TCP URL (live) or redis://redis:6379 (Docker)
TELEGRAM_BOT_TOKEN=1234567890:ABC...         # From @BotFather
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
TZ=Asia/Singapore
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | NestJS + TypeScript | Modular DI, built-in validation, Swagger |
| Frontend | React + Vite + Tailwind CSS | Fast, beautiful, shadcn/ui components |
| Database | PostgreSQL (Supabase) | Serverless, zero migration CLI needed |
| Queue | BullMQ + Redis (Upstash or local) | Exactly-once semantics, retries, rate limiting, repeatable cron jobs |
| AI | OpenAI GPT-4o-mini | Cost-efficient ($0.15/1M tokens), consistent structured text output |
| Messaging | Telegram Bot API | Simple token-based auth, no Meta business verification, free |
| Hosting | Render + Vercel (free tiers) | Zero cost, auto-deploy from GitHub |

---

## 2. Architecture

### How a Renewal Becomes a Notification

```
Operations Team
    │
    │  Exports monthly Excel from their system
    │  Drags & drops into the web upload page
    ▼
┌─────────────────────────────────────────────────────┐
│  1. UPLOAD & VALIDATE                                │
│                                                      │
│  • Accepts .xlsx / .csv (drag-and-drop)             │
│  • Checks every row: adviser name, phone, client,    │
│    policy, renewal date all required                 │
│  • Phone must be Singapore format                    │
│  • Date must be valid and in the future              │
│  • Premium is optional (blank = no premium line)     │
│  • Result: "228 valid · 7 invalid"                   │
│  • Invalid rows → downloadable CSV error report      │
│                                                      │
│  Tech: NestJS + SheetJS + class-validator             │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Valid rows saved to database
                       │ Status: pending (not sent yet)
                       ▼
┌─────────────────────────────────────────────────────┐
│  2. QUEUE & SCHEDULE                                 │
│                                                      │
│  • All valid renewals wait in a background queue     │
│  • Manual trigger: "Send All Pending" button         │
│  • Automatic trigger: cron runs every 5 minutes      │
│  • Only picks renewals due within 30 days            │
│  • Prevents duplicates (same client+policy+date =    │
│    skipped silently)                                  │
│  • Failed sends retry 3 times (1min · 5min · 15min) │
│                                                      │
│  Tech: BullMQ + Redis (Upstash)                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Queue worker picks up job
                       │ Rate-limited to 20 msgs/sec
                       ▼
┌─────────────────────────────────────────────────────┐
│  3. AI MESSAGE GENERATION                            │
│                                                      │
│  • System prompt defines exact message structure     │
│  • Custom-authored for professional financial tone   │
│  • Example output:                                   │
│                                                      │
│    Hi Sarah 👋                                       │
│                                                      │
│    Your client John Tan has a policy renewal         │
│    on 15 August 2026.                                │
│                                                      │
│    Policy: Elite Whole Life                          │
│                                                      │
│    Premium: S$2,800                                  │
│                                                      │
│    Please contact your client before the             │
│    renewal date.                                     │
│                                                      │
│  • Missing premium → line omitted automatically      │
│  • Temperature 0.3 for consistent output             │
│                                                      │
│  Tech: OpenAI GPT-4o-mini                            │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Generated message
                       ▼
┌─────────────────────────────────────────────────────┐
│  4. NOTIFY ADVISER                                   │
│                                                      │
│  • Message sent via Telegram Bot API                 │
│  • Delivered to adviser's phone (never the client)   │
│  • Status tracked: pending → processing → sent       │
│  • If Telegram fails → marked failed + auto-retried  │
│                                                      │
│  Tech: Telegram Bot API                              │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Status updated in database
                       ▼
┌─────────────────────────────────────────────────────┐
│  5. DASHBOARD                                        │
│                                                      │
│  • Live view of all renewals & their status          │
│  • Filter by: adviser name, status (sent/failed)     │
│  • Sort by: date, premium, client name               │
│  • Paginated for large datasets                      │
│  • Download error reports from past uploads          │
│                                                      │
│  Tech: React + Tailwind CSS + Supabase               │
└─────────────────────────────────────────────────────┘
```

### Technology Map

| What | Tech | Hosted On |
|------|------|-----------|
| Frontend UI | React + Vite + Tailwind CSS | Vercel (free) |
| Backend API | NestJS + TypeScript | Render (free) |
| Database | PostgreSQL | Supabase (free) |
| Job Queue | BullMQ | Upstash Redis (free) |
| AI Messages | GPT-4o-mini | OpenAI |
| Notifications | Telegram Bot API | Telegram (free) |

---

## 3. Assumptions

1. **Singapore context** — Phone numbers follow SG format (`+65 xxxx xxxx` or `xxxx xxxx`). All dates and times in `Asia/Singapore` timezone (`TZ=Asia/Singapore`)
2. **Single recipient** — All notifications go to one Telegram chat ID (auto-detected on first connect). The `bot_config` table stores the last connected chat. For production, per-adviser routing would store one chat ID per adviser
3. **Monthly batch** — Operations exports a complete list each month. The system does not handle incremental/delta uploads (validated rows from previous uploads are deduplicated via hash)
4. **30-day notification window** — Renewals within 30 days of the current date are eligible for notification. This aligns with MAS Fair Dealing Guidelines (minimum 14 days for policy renewal notices) and industry practice of providing advisers adequate time for client consultation before the renewal date
5. **Notifications to advisers only** — The system never sends to clients
6. **Flexible Excel formats** — Column headers matched case-insensitively via fuzzy mapping. Seven date formats auto-normalized (ISO, DD/MM/YYYY, DD-MM-YYYY, D.M.YYYY, Excel serial, text month, abbreviated month)
7. **Hash dedup scope** — Deduplication uses SHA256(client + policy + date + adviser) in lowercase. This treats a renewal as the same record regardless of phone number or premium changes, which aligns with the business reality that an adviser's client with a given policy renewal date is a single notification target. Monthly batch exports from the same operations system produce consistent source data, making this hash sufficient. A more granular hash including phone and premium could be added for environments where row-level variations need independent tracking

### Excel Parsing & Validation

**Supported Date Formats (Auto-Normalized to YYYY-MM-DD):**

| Input | Example | Output |
|-------|---------|--------|
| ISO | `2026-08-15` | `2026-08-15` |
| Excel serial | `46221` | `2026-08-15` |
| DD/MM/YYYY | `15/08/2026` | `2026-08-15` |
| DD-MM-YYYY | `15-08-2026` | `2026-08-15` |
| D.M.YYYY | `15.08.2026` | `2026-08-15` |
| Text month | `15 August 2026` | `2026-08-15` |
| Abbreviated | `15 Aug 2026` | `2026-08-15` |

**Column Mapping (Case-Insensitive):**

| Recognized Headers | Maps To |
|-------------------|---------|
| Adviser, adviser, ADVISER | `adviser` |
| Adviser Phone, adviser_phone, adviserphone | `adviserPhone` |
| Client, client | `client` |
| Policy, policy | `policy` |
| Renewal Date, renewal_date, renewaldate | `renewalDate` |
| Premium, premium | `premium` |

**Validation Rules (Per Row):**

| Field | Rule | Error Message (User) |
|-------|------|---------------------|
| Adviser | Required, max 100 chars, not blank | "Adviser name is required" |
| Adviser Phone | Required, SG format | "Phone number is not a valid Singapore number. Use: +65 9123 4567" |
| Client | Required, max 100 chars, not blank | "Client name is required" |
| Policy | Required, max 200 chars, not blank | "Policy name is required" |
| Renewal Date | Required, YYYY-MM-DD, not in past | "Date is not in a valid format" or "This date is in the past" |
| Premium | Optional, must be ≥0 | "Premium cannot be negative" or "Premium must be a number" |

**File-Level Validation:**

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

---

## 4. Trade-offs

### Telegram over WhatsApp (Messaging)
Telegram Bot API requires no business verification, uses simple token-based auth, and operates at zero cost. This reduces the barrier to deployment and iteration for internal tools where Meta's business verification process adds unnecessary friction. The `TelegramService.send()` function fulfills the same role as the required `WhatsAppService.send()` — mock implementation is explicitly permitted, and Telegram provides a functionally equivalent notification channel for advisers.

### Supabase Client over TypeORM/Prisma (Database)
Direct Supabase JS client with repository pattern eliminates migration CLI dependencies and reduces boilerplate for a focused schema. The service_role key bypasses Row-Level Security for server-side operations while RLS remains enabled on all tables as a defense-in-depth measure. Trade-off: manual snake_case ↔ camelCase column mapping required instead of decorator-based entities.

### BullMQ In-Process Worker (Queue)
Worker runs within the same NestJS process for simplicity. On Render's free 512MB instance, the combined API + Worker footprint is well within limits. Trade-off: scaling beyond a single instance requires splitting to a separate worker process. BullMQ provides exactly-once semantics, 3x retry with exponential backoff, and rate limiting out of the box.

### Cron-Triggered Sending (Not Immediate Queue)
Upload stores renewals as `pending` without sending. A "Send All Pending" button provides instant feedback, while the cron fires every 5 minutes as the automated path. This avoids duplicate sends from overlapping manual and automated triggers, and gives the operations team control over timing. The cron repeatable job config is stored in Upstash Redis, surviving Render process restarts.

### Raw BullMQ over @nestjs/bull (Dependency Injection)
Direct `new Queue()` and `new Worker()` provide access to BullMQ v5's full API surface including repeatable job scheduling and fine-grained ioredis connection options needed for Upstash Redis compatibility.

### Two Separate Rate Limiters
`ThrottlerModule` (NestJS) protects HTTP endpoints from external abuse. A custom token bucket (20 msg/sec) protects Telegram's API rate limit. They serve different services — our API vs Telegram's API — and operate at different granularities.

### In-Memory Token Bucket for Telegram
The Telegram rate limiter uses an in-memory token bucket at 20 msg/sec (Telegram allows ~30/sec). Trade-off: not distributed across instances — acceptable for a single Render instance. Production multi-instance deployments would use a Redis-based rate limiter.

### Free-Tier Hosting with Cold Start
Render's free tier sleeps after 15 minutes of inactivity. An UptimeRobot monitor pings the health endpoint every 5 minutes to prevent this. The frontend also handles cold starts by displaying "Waking up server..." and polling until the backend responds.

---

## 5. Improvements (Ranked by Business Value)

1. **Per-adviser Telegram routing** — Store one chat ID per adviser (from the Excel data), route each notification to the correct adviser. This turns the system from a single-recipient tool into a multi-adviser production platform
2. **Configurable notification window** — Different insurance products need different lead times. An env-configurable `RENEWAL_WINDOW_DAYS` would support 14-, 30-, or 60-day windows per product type
3. **Email fallback via Resend** — If Telegram delivery fails after 3 retries, send the notification via email to ensure zero missed renewals
4. **Full end-to-end test suite** — HTTP-level tests against a running instance to validate the complete request-response cycle for production deployment confidence
5. **CSV/Excel template download** — "Download Template" button on the Upload page with exact headers reduces onboarding friction for the operations team
6. **Separate worker process** — Deploy the BullMQ Worker as an independent Render service for isolated resource allocation and independent scaling
7. **Redis-based distributed rate limiting** — Replace the in-memory token bucket with a Redis-backed limiter for consistent rate enforcement across multiple instances

---

## Cron Scheduling

- **Pattern:** `*/5 * * * *` (every 5 minutes, UTC)
- **Behavior:** Scans for pending renewals where `renewal_date ≤ today + 30 days`

## AI Prompt Strategy

Custom-authored prompt (`backend/src/modules/ai/prompts/renewal-reminder.prompt.ts`) using GPT-4o-mini at temperature 0.3 for consistent, professional, plain-text messages. Handles missing premium gracefully (omits the line). No markdown, no signatures, wave emoji only in greeting.

## Security

| Protection | Implementation |
|-----------|---------------|
| Authentication | JWT via Supabase Auth |
| SQL injection | All queries via Supabase parameterized client |
| XSS | React auto-escapes, DTO `whitelist: true` |
| Row-Level Security | Enabled on all 4 tables, service_role-only access |
| Input sanitization | All fields trimmed, whitespace-only rejected, `@IsNotEmpty` on required fields |
| Infinity/NaN guard | `isFinite()` check on premium before DB insert |
| XML bomb (XLSX) | `sheetRows: 10001`, `cellFormula: false`, `cellStyles: false` |
| Corrupted file guard | PK magic byte check (`0x50`) for valid XLSX format |
| File size limit | 10MB maximum |
| Row count limit | 10,000 rows per file |
| Rate limiting | 3-tier `ThrottlerModule` on all endpoints |
| Secrets | `.env` gitignored, `.env.example` committed with empty values |

## Testing

```bash
cd backend
pnpm test          # 29 unit + integration tests
pnpm test:cov      # Coverage report
```

All tests mock external dependencies (Supabase, OpenAI, Telegram, Redis) to test logic in isolation without requiring real API keys.

## License

MIT
