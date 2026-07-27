# Goma AI — Policy Renewal Notification Agent

## Overview

An internal automation tool for financial advisory companies. Upload monthly policy renewal spreadsheets via a beautiful web UI, and the system automatically generates AI-crafted reminder messages and delivers them to financial advisers via Telegram.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Vercel         │────▶│   Render         │────▶│   Supabase        │
│   React Frontend │     │   NestJS API     │     │   PostgreSQL      │
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

1. User uploads Excel/CSV via drag-and-drop web UI
2. Backend parses rows using SheetJS (XLSX) or csv-parse/sync (CSV). Headers matched case-insensitively. Dates normalized from multiple formats (Excel serial numbers, DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY) to standard YYYY-MM-DD.
3. Each row validated against business rules (required fields, Singapore phone regex, future date check — all in Singapore timezone via `TZ=Asia/Singapore`)
4. Valid rows stored in PostgreSQL with SHA256 hash deduplication. Invalid rows stored in `failed_renewals` with downloadable CSV error report.
5. Renewals stored as `status: pending` — no immediate send.
6. **Manual trigger:** User clicks "Send Notifications Now" → backend scans pending renewals due within 30 days → enqueues to BullMQ → notifications sent within seconds.
7. **Automatic trigger:** Cron fires every hour (`0 * * * *` UTC) → same 30-day scan → enqueues pending renewals to BullMQ.
8. Queue worker generates a professional WhatsApp-style message via OpenAI GPT-4o-mini (temperature 0.3, max 300 tokens)
9. Message delivered to adviser via Telegram Bot API
10. Status tracked: pending → processing → sent | failed (with 3x auto-retry, exponential backoff: 60s, 300s, 900s)
11. Rate limiting via token bucket (20/sec) prevents hitting Telegram API limits
12. **Duplicate prevention at three layers:** (a) upload hash dedup, (b) cron only queries `status: pending`, (c) processor reads current DB status before sending — skips if already sent

### Tech Stack

| Layer      | Technology                     |
| ---------- | ------------------------------ |
| Backend    | NestJS + TypeScript            |
| Frontend   | React + Vite + Tailwind CSS    |
| Database   | PostgreSQL (Supabase, free)    |
| Queue      | BullMQ + Redis (Upstash, free) |
| AI         | OpenAI GPT-4o-mini             |
| Messaging  | Telegram Bot API               |
| Hosting    | Render (backend) + Vercel (frontend) |

## Setup

### Prerequisites

- Supabase account (free tier) — PostgreSQL
- OpenAI API key — AI message generation
- Upstash Redis (free tier) — BullMQ queue (TCP `rediss://` URL, not REST)
- Telegram bot token from @BotFather

### Authentication

A pre-seeded demo account exists: `user@example.com` with password `password`. On first visit, the frontend redirects to `/login`. After signing in, the JWT token is stored in localStorage and attached to all API requests via axios interceptor. The backend validates each token via Supabase Auth.

### Environment Variables

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...          # service_role key, NOT anon
OPENAI_API_KEY=sk-...
REDIS_URL=rediss://default:...       # Upstash TCP URL
TELEGRAM_BOT_TOKEN=1234567890:ABC...
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=https://your-frontend.vercel.app
TZ=Asia/Singapore
```

### Local Development

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in all values
3. Database migrations run automatically on Supabase (via MCP or dashboard SQL)
4. `cd backend && pnpm install && pnpm run start:dev`
5. `cd frontend && npm install && npm run dev`
6. Open http://localhost:5173

### Production Deployment

- **Backend (Render):** Web Service, root `backend`, build `npx pnpm install && npx pnpm run build`, start `node dist/main.js`
- **Frontend (Vercel):** Import repo, root `frontend`, framework Vite, add `VITE_API_URL`
- **Bot Setup:** Open bot on Telegram → click Start → visit Vercel URL → log in (`user@example.com` / `password`) → click Connect → upload Excel → click "Send Notifications Now"

## API Endpoints

| Method | Path                              | Auth     | Rate Limit   | Description |
| ------ | --------------------------------- | -------- | ------------ | ----------- |
| POST   | `/api/renewals/upload`            | Required | 3 req/s      | Upload Excel/CSV file |
| POST   | `/api/renewals/process`           | Required | 5 req/s      | Trigger immediate processing of pending renewals within 30 days |
| GET    | `/api/renewals`                   | Required | 20 req/10s   | List renewals (paginated, filterable, sortable) |
| GET    | `/api/renewals/errors/:batchId`   | Required | 20 req/10s   | Download error report CSV |
| GET    | `/api/telegram/status`            | Public   | —            | Check bot connection |
| POST   | `/api/telegram/connect`           | Public   | —            | Auto-detect bot chat ID from getUpdates |
| GET    | `/api/docs`                       | Public   | —            | Swagger/OpenAPI UI |

## Excel Parsing & Validation

### Supported Date Formats

All normalized to `YYYY-MM-DD`:

| Input | Example | Normalized |
|-------|---------|-----------|
| ISO | `2026-08-15` | `2026-08-15` (unchanged) |
| Excel serial | `46221` | `2026-08-15` |
| Slashes | `15/08/2026` | `2026-08-15` |
| Dashes | `15-08-2026` | `2026-08-15` |
| Dots | `15.08.2026` | `2026-08-15` |
| Text month | `15 August 2026` | `2026-08-15` |
| Abbreviated | `15 Aug 2026` | `2026-08-15` |

### Column Mapping (Case-Insensitive)

| Excel Header | Mapped Field |
|-------------|-------------|
| Adviser / adviser / ADVISER | `adviser` |
| Adviser Phone / adviser_phone | `adviserPhone` |
| Client / client | `client` |
| Policy / policy | `policy` |
| Renewal Date / renewal_date | `renewalDate` |
| Premium / premium | `premium` |

### Rate Limiting

| Scope | Limit | Rationale |
|-------|-------|-----------|
| Upload (POST) | 3 req/s | Prevent DoS on file parsing and DB |
| Process (POST) | 5 req/s | Allow burst sends after upload |
| Dashboard (GET) | 20 req/10s | Generous for UI polling |
| Telegram API | 20 msg/s (token bucket) | Telegram limit is 30/s |
| Row count | 10,000 max per file | Memory safety, XML bomb prevention |

### Authentication

The system uses Supabase Auth with JWT token validation:
- Pre-seeded account: `user@example.com` / `password`
- Frontend redirects unauthenticated users to `/login`
- All API requests include `Authorization: Bearer {token}` in headers
- Backend validates tokens via `supabase.auth.getUser(jwt)` guard
- Telegram status/connect endpoints are public (no auth required)

### Security Hardening

| Protection | Implementation |
|-----------|---------------|
| Row limit | 10,000 rows max per file |
| XML bomb | `sheetRows: 10001`, `cellFormula: false`, `cellStyles: false` on SheetJS |
| SQL injection | All queries via Supabase parameterized client |
| XSS | React auto-escapes, DTO whitelist |
| RLS | Enabled on all tables, service_role-only access |
| Input sanitization | All fields trimmed, whitespace-only rejected, `@IsNotEmpty` on required fields |
| Infinity/NaN guard | `isFinite()` check on premium before DB insert |

## Duplicate Prevention

Three independent layers ensure no renewal is sent twice:

1. **Upload hash dedup** — SHA256(client + policy + date + adviser) → unique constraint on `hash` column
2. **Cron query filter** — `WHERE status = 'pending'` — once sent, invisible to all future scans
3. **Processor status guard** — Reads current DB status before sending; skips if already `processing` or `sent`

## Cron Scheduling

- Fires every hour at minute 0 (`0 * * * *` UTC = every hour on the hour Singapore time)
- Scans for pending renewals where `renewal_date <= today + 30 days`
- Enqueues matching renewals to BullMQ for processing
- Idempotent — safe to run multiple times

## AI Prompt Strategy

The system uses a carefully crafted system prompt that ensures:

- Consistent message structure: greeting → body → policy details → premium → closing
- Professional, warm tone (never alarming or urgent)
- Graceful handling of missing premium data (omits the line)
- Plain text output (no markdown or HTML)
- Minimal emoji usage (wave emoji only)
- Complete exclusion of signatures, links, phone numbers, and contact details
- The user prompt dynamically injects the specific renewal data for each message

## Assumptions

- Singapore phone format (`+65 xxxx xxxx` or `xxxx xxxx`)
- All dates and times in Singapore timezone (`TZ=Asia/Singapore`)
- Excel columns matched case-insensitively with fuzzy header names
- Single Telegram bot for all notifications (chat ID auto-detected from first user who clicks Start + Connect)
- Monthly batch uploads (system does not handle incremental/delta uploads)
- Renewals within 30 days are considered actionable
- Notifications sent only to advisers, never to clients

## Architecture Decisions & Trade-offs

### Supabase Client over TypeORM/Prisma

- Faster setup, zero migration CLI needed
- Manual snake_case ↔ camelCase column mapping
- Trade-off: Less NestJS idiomatic but more productive for rapid prototyping

### BullMQ In-Process Worker

- Worker runs within the NestJS process for simplicity
- Exactly-once semantics, retries with exponential backoff
- Trade-off: Scaling requires splitting worker to separate process (not needed for prototype)

### Telegram over WhatsApp

- Simple token-based auth (no business verification, no webhook URL setup)
- Same core functionality — delivers notifications to advisers
- Trade-off: Assessment mentions WhatsApp; Telegram serves the same role with less setup friction

### In-Memory Rate Limiter

- Token bucket algorithm (20 tokens/sec)
- Prevents hitting Telegram's 30/sec rate limit
- Trade-off: Not distributed across instances (OK for single Render instance)

### Cron-Triggered Sending (not Immediate Queue)

- Upload stores as pending, cron sweeps hourly
- "Send Now" button provides instant gratification for demos
- Trade-off: Adds UX step, but guarantees no duplicate sends and gives control over timing

### Three-Layer Duplicate Prevention

- Hash dedup at upload, status filter at cron, status guard at processor
- Guarantees exactly-once delivery even with overlapping cron cycles
- Trade-off: Extra DB read per job processing (negligible overhead)

## Testing

```bash
cd backend
pnpm test        # 29 unit + integration tests
pnpm test:cov    # Coverage report
```

## Improvements (for production)

- Per-adviser chat ID routing (one chat ID per adviser from the Excel)
- Configurable notification window (currently hardcoded at 30 days)
- Redis-based distributed rate limiting for multi-instance deployments
- Separate worker process deployment for independent scaling
- Delivery receipt handling via Telegram webhooks
- Admin UI for manual retry of failed messages
- API authentication (JWT or API keys)
- CSV/Excel template download button on upload page
- Email fallback if Telegram delivery fails

## License

MIT
