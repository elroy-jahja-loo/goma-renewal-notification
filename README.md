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
2. Backend parses and validates each row (required fields, phone format, date checks)
3. Valid rows stored in PostgreSQL; invalid rows captured in downloadable CSV error report
4. Each valid renewal enters BullMQ queue with 5-second delay
5. Queue worker generates a professional WhatsApp-style message via OpenAI GPT-4o-mini
6. Message delivered to adviser via Telegram Bot API
7. Status tracked: pending → processing → sent | failed (with 3x auto-retry, exponential backoff)
8. Rate limiting via token bucket (20/sec) prevents hitting Telegram API limits

### Tech Stack

| Layer      | Technology                |
| ---------- | ------------------------- |
| Backend    | NestJS + TypeScript       |
| Frontend   | React + Vite + Tailwind CSS |
| Database   | PostgreSQL (Supabase)     |
| Queue      | BullMQ + Redis (Upstash)  |
| AI         | OpenAI GPT-4o-mini        |
| Messaging  | Telegram Bot API          |
| Hosting    | Render (backend) + Vercel (frontend) |

## Setup

### Prerequisites

- Supabase account (free tier) — PostgreSQL
- OpenAI API key — AI message generation
- Upstash Redis (free tier) — BullMQ queue
- Telegram bot token from @BotFather

### Local Development

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in all values
3. Apply database migrations via Supabase MCP or dashboard SQL editor
4. `cd backend && pnpm install && pnpm run start:dev`
5. `cd frontend && npm install && npm run dev`
6. Open http://localhost:5173

### Production Deployment

- **Backend (Render):** Web Service, build `pnpm install && pnpm run build`, start `node dist/main.js`, set all env vars
- **Frontend (Vercel):** Import repo, root `frontend`, set `VITE_API_URL`
- **Bot Setup:** Open bot on Telegram → click Start → visit Vercel URL → click Connect

## API Endpoints

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| POST   | `/api/renewals/upload`        | Upload Excel/CSV file                |
| GET    | `/api/renewals`               | List renewals (paginated, filterable) |
| GET    | `/api/renewals/errors/:batchId` | Download error report CSV           |
| GET    | `/api/telegram/status`        | Check bot connection                 |
| POST   | `/api/telegram/connect`       | Auto-detect bot chat ID              |
| GET    | `/api/docs`                   | Swagger/OpenAPI UI                   |

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
- All dates in Singapore timezone
- Excel columns match exact header names (case-insensitive matching applied)
- Single Telegram bot for all notifications (chat ID auto-detected from first user who clicks Start)
- Monthly batch uploads (system does not handle incremental/delta uploads)
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

## Improvements (for production)

- Per-adviser chat ID routing (one chat ID per adviser from the Excel)
- Cron-based scheduled uploads using BullMQ repeatable jobs
- Redis-based distributed rate limiting for multi-instance deployments
- Separate worker process deployment for independent scaling
- Delivery receipt handling via Telegram webhooks
- Admin UI for manual retry of failed messages
- API authentication (JWT or API keys)
- CSV template download button on upload page

## Testing

```bash
cd backend
pnpm test
pnpm test:cov
```

## License

MIT
