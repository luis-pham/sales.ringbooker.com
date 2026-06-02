# 11 — Worker & Background Jobs
> 24/7 worker deployed on Railway (separate from RingBooker server)
> Handles: search, enrichment, Instagram, scoring, auto-demo

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   Vercel (free)     │     │   Railway ($5/mo)    │
│                     │     │                      │
│  sales.ringbooker   │     │  Worker (Node.js)    │
│  .com — Next.js UI  │     │  Runs 24/7           │
│  + API routes       │     │  Poll every 2s       │
└────────┬────────────┘     └──────────┬───────────┘
         │                             │
         └──────────┬──────────────────┘
                    │
         ┌──────────▼──────────┐
         │   Supabase (free)   │
         │   jobs table        │
         │   salon_leads       │
         │   all data          │
         └─────────────────────┘

RingBooker server: COMPLETELY SEPARATE — not touched
```

---

## Why Railway (not VPS, not Vercel Cron)

```
Vercel Cron:  max 60s/run → not enough for 24/7 crawling
VPS (shared): risks affecting RingBooker production calls
Railway:      isolated long-running process, $5/mo, zero config
```

---

## 1. Worker Script

File: `scripts/worker.ts`

```typescript
import 'dotenv/config'

import { handleSearchRun } from '../src/lib/jobs/handlers/search'
import { handleEnrichLead } from '../src/lib/jobs/handlers/enrich'
import { handleEnrichInstagram } from '../src/lib/jobs/handlers/instagram'
import { handleScoreLead } from '../src/lib/jobs/handlers/score'
import { handleAutoCreateDemo } from '../src/lib/jobs/handlers/auto-demo'
import {
  claimJob,
  completeJob,
  failJob,
  releaseStaleJobs,
} from '../src/lib/jobs/queue'
import type { Job } from '../src/types'

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '2000')
const STALE_JOB_TIMEOUT_MINUTES = 15
const MAX_CONSECUTIVE_ERRORS = 10

let consecutiveErrors = 0
let isShuttingDown = false

// ─── Job dispatcher ───────────────────────────────────────────────────────

async function processJob(job: Job): Promise<void> {
  switch (job.type) {
    case 'search_run':
      await handleSearchRun(job.payload as any)
      break
    case 'enrich_lead':
      await handleEnrichLead(job.payload as any)
      break
    case 'enrich_instagram':
      await handleEnrichInstagram(job.payload as any)
      break
    case 'score_lead':
      await handleScoreLead(job.payload as any)
      break
    case 'auto_create_demo':
      await handleAutoCreateDemo(job.payload as any)
      break
    case 'cleanup':
      await handleCleanup()
      break
    default:
      throw new Error(`Unknown job type: ${(job as any).type}`)
  }
}

async function handleCleanup(): Promise<void> {
  // Future: clean expired demos, archive old leads, etc.
  console.log('[Worker] Cleanup job — nothing to do yet')
}

// ─── Main loop ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWorker(): Promise<void> {
  console.log(`[Worker] Starting ${WORKER_ID}`)
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS}ms`)
  console.log(`[Worker] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30)}...`)

  while (!isShuttingDown) {
    try {
      // Release stale processing jobs (worker crashed previously)
      const released = await releaseStaleJobs(STALE_JOB_TIMEOUT_MINUTES)
      if (released > 0) {
        console.log(`[Worker] Released ${released} stale job(s)`)
      }

      // Claim next available job
      const job = await claimJob(WORKER_ID)

      if (!job) {
        consecutiveErrors = 0
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const start = Date.now()
      console.log(`[Worker] → Processing: ${job.type} | ${job.id} | attempt ${job.attempts}`)

      try {
        await processJob(job)
        const duration = Date.now() - start
        console.log(`[Worker] ✓ Done: ${job.type} | ${duration}ms`)
        await completeJob(job.id, { durationMs: duration, workerId: WORKER_ID })
        consecutiveErrors = 0

      } catch (jobError) {
        const duration = Date.now() - start
        const errMsg = jobError instanceof Error ? jobError.message : String(jobError)
        console.error(`[Worker] ✗ Failed: ${job.type} | ${errMsg} | ${duration}ms`)
        await failJob(job.id, errMsg, job.attempts, job.max_attempts)
      }

    } catch (loopError) {
      consecutiveErrors++
      const errMsg = loopError instanceof Error ? loopError.message : String(loopError)
      console.error(`[Worker] Loop error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${errMsg}`)

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('[Worker] Too many consecutive errors — exiting for Railway to restart')
        process.exit(1)
      }

      // Exponential backoff on loop errors
      await sleep(POLL_INTERVAL_MS * Math.min(consecutiveErrors, 5))
    }
  }

  console.log('[Worker] Shutdown complete')
}

// ─── Graceful shutdown ────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM — shutting down gracefully...')
  isShuttingDown = true
  // Give current job time to finish (max 30s)
  await sleep(30_000)
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT — shutting down')
  isShuttingDown = true
  process.exit(0)
})

process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Unhandled rejection:', reason)
  process.exit(1)
})

// ─── Start ────────────────────────────────────────────────────────────────

runWorker().catch(err => {
  console.error('[Worker] Fatal startup error:', err)
  process.exit(1)
})
```

---

## 2. Railway Configuration

### `railway.toml` (root of project)

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run worker"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
healthcheckPath = "/health"
healthcheckTimeout = 30
```

### `railway.json` (alternative)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run worker",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## 3. Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "worker": "tsx scripts/worker.ts",
    "worker:dev": "tsx watch scripts/worker.ts",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 4. Environment Variables on Railway

Set these in Railway dashboard → Service → Variables:

```env
# Supabase (same project as Vercel)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Search providers
SERPER_API_KEY=xxxx
GOOGLE_PLACES_API_KEY=xxxx

# Instagram
APIFY_API_TOKEN=apify_api_xxxx

# Worker config
WORKER_ID=railway-worker-1
WORKER_POLL_INTERVAL_MS=2000

# Internal
INTERNAL_API_SECRET=xxxx

# [FUTURE] RingBooker integration
# RINGBOOKER_INTERNAL_API_URL=https://ringbooker.com
# RINGBOOKER_INTERNAL_API_KEY=xxxx
```

**Note:** Railway worker does NOT need:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (uses service role only)
- `GOOGLE_CLIENT_ID/SECRET` (no auth needed)
- `NEXTAUTH_*` (no web server)

---

## 5. Job Rate Limiting

Worker chạy 24/7 cần rate limiting để không bị block:

### Website crawling

```typescript
// src/lib/jobs/handlers/enrich.ts
// Add delay between crawls for same domain

const domainLastCrawled = new Map<string, number>()
const MIN_CRAWL_INTERVAL_MS = 2000  // 2s between same domain

async function respectRateLimit(url: string): Promise<void> {
  try {
    const domain = new URL(url).hostname
    const lastCrawled = domainLastCrawled.get(domain) ?? 0
    const elapsed = Date.now() - lastCrawled
    if (elapsed < MIN_CRAWL_INTERVAL_MS) {
      await sleep(MIN_CRAWL_INTERVAL_MS - elapsed)
    }
    domainLastCrawled.set(domain, Date.now())
  } catch {}
}
```

### Serper API

```typescript
// Max 10 requests/second on paid plan
// Enqueue search jobs with delay between cities:

// In search page: when user triggers multiple cities,
// stagger job creation by 5 seconds each
const runAt = new Date(Date.now() + index * 5000)
await enqueueJob('search_run', { searchRunId }, { runAt })
```

### Apify (Instagram)

```typescript
// Apify handles rate limiting internally
// But limit concurrent Instagram jobs to avoid overspending:

// In worker: only process 1 enrich_instagram at a time
// (naturally enforced since worker is single-threaded)
```

---

## 6. Job Priority (optional future enhancement)

Currently all jobs are FIFO. If needed later:

```sql
-- Add priority column to jobs table
ALTER TABLE jobs ADD COLUMN priority integer NOT NULL DEFAULT 5;

-- High priority: score_lead (fast, needed for UI)
-- Medium priority: enrich_lead
-- Low priority: enrich_instagram (slow, Apify)

-- Update claim_next_job RPC:
ORDER BY priority ASC, created_at ASC
```

---

## 7. Monitoring on Railway

Railway dashboard shows:
- CPU/Memory usage
- Logs in real-time
- Restart count
- Deployment history

**Add basic health logging:**

```typescript
// In worker loop, log stats every 5 minutes:
let lastHealthLog = Date.now()
const HEALTH_LOG_INTERVAL = 5 * 60 * 1000

// In main loop:
if (Date.now() - lastHealthLog > HEALTH_LOG_INTERVAL) {
  const { data: pending } = await adminClient
    .from('jobs')
    .select('type', { count: 'exact' })
    .eq('status', 'pending')

  console.log(`[Worker] Health: ${pending?.length ?? 0} pending jobs`)
  lastHealthLog = Date.now()
}
```

---

## 8. Handling Long-Running Jobs

Some jobs take longer than others:

```
search_run:       ~10-30s  (Serper + insert leads)
enrich_lead:      ~5-15s   (website crawl)
enrich_instagram: ~30-90s  (Apify polling)
score_lead:       ~1-2s    (pure computation)
auto_create_demo: ~2-5s    (build payload + save)
```

Instagram enrichment can take up to 90s — well within Railway's limits.

If Apify is slow, the job will hold the worker for up to 90s.
Worker is single-threaded — this is fine for our scale.

**If future scale requires parallel workers:**
```bash
# Run 2 workers on Railway (2 services):
# Worker 1: WORKER_ID=railway-worker-1
# Worker 2: WORKER_ID=railway-worker-2
# Both safely claim different jobs via SKIP LOCKED
```

---

## 9. Vercel Cron (backup only)

Keep as fallback in case Railway is down:

### `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/jobs/worker",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs every 5 minutes as backup — Railway worker will normally process jobs first.

### `src/app/api/jobs/worker/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalSecret } from '@/lib/utils/security'
import { claimJob, completeJob, failJob, releaseStaleJobs } from '@/lib/jobs/queue'
import { handleSearchRun } from '@/lib/jobs/handlers/search'
import { handleEnrichLead } from '@/lib/jobs/handlers/enrich'
import { handleEnrichInstagram } from '@/lib/jobs/handlers/instagram'
import { handleScoreLead } from '@/lib/jobs/handlers/score'
import { handleAutoCreateDemo } from '@/lib/jobs/handlers/auto-demo'

// Vercel free: 10s timeout
// Vercel Pro: 300s timeout
const MAX_JOBS_PER_RUN = 5
const WORKER_ID = `vercel-cron-${Date.now()}`

export async function POST(request: NextRequest) {
  // Verify this is called by Vercel cron or internal trigger
  const secret = request.headers.get('X-Internal-Secret')
  if (!verifyInternalSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await releaseStaleJobs(15)

  let processed = 0
  let failed = 0

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const job = await claimJob(WORKER_ID)
    if (!job) break

    try {
      switch (job.type) {
        case 'search_run':       await handleSearchRun(job.payload as any); break
        case 'enrich_lead':      await handleEnrichLead(job.payload as any); break
        case 'enrich_instagram': await handleEnrichInstagram(job.payload as any); break
        case 'score_lead':       await handleScoreLead(job.payload as any); break
        case 'auto_create_demo': await handleAutoCreateDemo(job.payload as any); break
      }
      await completeJob(job.id)
      processed++
    } catch (error) {
      await failJob(job.id, String(error), job.attempts, job.max_attempts)
      failed++
    }
  }

  return NextResponse.json({ processed, failed, workerId: WORKER_ID })
}

// Allow Vercel cron (GET) and manual trigger (POST)
export async function GET(request: NextRequest) {
  return POST(request)
}
```

---

## Definition of Done

- [ ] `scripts/worker.ts` runs without errors locally (`npm run worker`)
- [ ] `railway.toml` created at project root
- [ ] Railway service created, connected to GitHub repo
- [ ] All env vars set in Railway dashboard
- [ ] Worker deployed and showing logs in Railway
- [ ] Worker processes `enrich_lead` jobs successfully
- [ ] Railway auto-restarts worker if it crashes
- [ ] `vercel.json` cron configured as backup
- [ ] Worker does NOT share server with RingBooker
- [ ] Health log appears every 5 minutes in Railway logs
