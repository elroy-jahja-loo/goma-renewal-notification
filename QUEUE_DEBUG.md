# Queue Connection Problem — Research Brief

## Symptom

`POST /api/renewals/process` hangs exactly 30 seconds then aborts (`statusCode: null`, `msg: "request aborted"`). All other endpoints work fine. The hang point is `queue.add()` in BullMQ's Queue class.

## Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Backend | NestJS + TypeScript | Modular architecture |
| Queue | BullMQ v5.81.2 | In-process Worker + Queue |
| Redis client | ioredis v5.11.1 | Ships with BullMQ |
| Redis host | Upstash | Free tier, 256MB, 100 conns, `rediss://` TCP URL |
| Hosting | Render | Free tier (hibernates after 15min idle) |
| DB | Supabase | Works fine, not the issue |

## What Works

- BullMQ **Worker** connects to the same `rediss://` URL and initializes successfully (logs "RenewalProcessor Worker initialized")
- All GET endpoints respond fine
- Supabase queries work
- App boots without errors

## What Fails

- BullMQ **Queue's** `add()` method never resolves
- Queue is created once in NestJS `QueueService` constructor (`new Queue('renewal-notifications', { connection: { url: REDIS_URL } })`)
- The Queue instance is reused for all job additions
- Worker and Queue each create their own ioredis connections

## What We've Tried (None Fixed It)

| Attempt | Result |
|---------|--------|
| `retryStrategy` with backoff | Still hangs |
| `maxRetriesPerRequest: null` | Still hangs |
| `connectTimeout: 10000` | Still hangs |
| `enableOfflineQueue: false` | Still hangs |
| `maxRetriesPerRequest: 3` (fast fail) | Still hangs |
| `Promise.race` with 15s timeout | Still hangs (timeout fires, not the add) |
| `setImmediate` for cron (not `await`ing) | Fixed startup hang, not Queue issue |

## Key Observation

The Worker's ioredis connection works. The Queue's ioredis connection doesn't. They use the **identical** Redis URL. The difference is lifecycle timing: Queue is created earlier in NestJS bootstrap (constructor at module init), Worker is created later (`OnModuleInit`).

## Research Questions

1. Why does a BullMQ Queue's ioredis connection silently fail to connect/reconnect after Render free-tier hibernation while a BullMQ Worker on the same Redis URL succeeds?

2. Is this a known issue with Upstash free tier + BullMQ? (connection limits, rate limits, idle timeouts)

3. Does Upstash free tier reject or silently drop some connections during startup? (100 conn limit, but we only use ~4)

4. Is there a known ioredis issue where the Queue-created connection enters a zombie state (half-open, won't reconnect, won't throw)?

5. Should the Queue connection be lazily created (only when needed) rather than in the constructor?

6. Could the `rediss://` (TLS) handshake be timing out specifically during the early bootstrap phase but succeeding later when the Worker connects?

## Files Involved

- `backend/src/modules/queue/queue.service.ts` — Queue creation + addJobs
- `backend/src/modules/queue/queue.processor.ts` — Worker creation
- `backend/src/modules/upload/upload.controller.ts` — `processNow()` endpoint
- `backend/src/app.module.ts` — module import order
