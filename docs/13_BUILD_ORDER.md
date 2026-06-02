# 13 — Build Order
> Step-by-step implementation for AI coding assistant
> Infrastructure: Vercel (UI) + Railway (Worker) + Supabase (DB)
> Completely separate from RingBooker server

---

## Infrastructure Overview

```
┌─────────────────────────────────────────────────────┐
│  sales.ringbooker.com                               │
│                                                     │
│  Vercel (free)          Railway ($5/mo)             │
│  ─────────────          ────────────────            │
│  Next.js UI + API  ←──→ Worker 24/7                │
│                    ↕                                │
│               Supabase (free)                       │
│               DB + Auth + Storage                   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  RingBooker server: NOT TOUCHED, stays separate     │
└─────────────────────────────────────────────────────┘
```

---

## Pre-requisites

Before starting, have ready:
- [ ] Supabase account → create new project (separate from RingBooker)
- [ ] Google Cloud Console → OAuth 2.0 credentials
- [ ] Serper API key (serper.dev — $50 free credits to start)
- [ ] Apify account + API token
- [ ] Vercel account (free)
- [ ] Railway account (free to start, $5/mo for always-on)
- [ ] GitHub repo created for this project

---

## STEP 1 — Project Init
**Time: ~1 hour**
**Read: 00_PROJECT_OVERVIEW.md**

```bash
npx create-next-app@latest sales-ringbooker \
  --typescript --tailwind --app --src-dir \
  --import-alias "@/*" --no-git

cd sales-ringbooker

# Initialize git
git init
git branch -M main

# Core
npm install @supabase/supabase-js @supabase/ssr
npm install zod date-fns lucide-react sonner
npm install class-variance-authority clsx tailwind-merge
npm install @tanstack/react-query

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button input label card badge dialog
npx shadcn@latest add sheet dropdown-menu select table tabs
npx shadcn@latest add avatar skeleton textarea alert tooltip
npx shadcn@latest add progress separator

# Worker + crawling
npm install cheerio
npm install --save-dev tsx dotenv @types/node

# Create .env.local
cp .env.example .env.local
```

Create `.gitignore`:
```
.env.local
.env*.local
node_modules/
.next/
```

Create `.env.example` with all keys listed (no values).

**✓ Done when:** `npm run dev` starts on localhost:3000 without errors.

---

## STEP 2 — Supabase Setup
**Time: ~1 hour**
**Read: 01_DATABASE_SCHEMA.md**

1. Create new Supabase project (NOT the same as RingBooker)
2. Go to SQL Editor → run migrations in order:
   ```
   001_profiles.sql
   002_invitations.sql
   003_search_runs.sql
   004_salon_leads.sql
   005_snapshots.sql
   006_scores.sql
   007_demos.sql
   008_outreach.sql
   009_evidence.sql
   010_follow_ups.sql
   011_jobs.sql
   ```
3. Run RPC functions:
   - `claim_next_job`
   - `release_stale_jobs`
   - `get_pipeline_stats`
4. Storage: create bucket `evidence` (private) + RLS policies

Create `src/types/index.ts` with all TypeScript types.

Create Supabase clients:
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`

**✓ Done when:** All 11 tables visible in Supabase Table Editor.

---

## STEP 3 — Auth
**Time: ~2 hours**
**Read: 02_AUTH_USER_MANAGEMENT.md**

1. Supabase Dashboard → Auth → Providers → Enable Google
2. Add Google OAuth credentials
3. Add redirect URL: `http://localhost:3000/auth/callback`

Create files:
```
middleware.ts                              ← project root
src/app/(auth)/login/page.tsx
src/app/auth/callback/route.ts
src/app/(auth)/invite/[token]/page.tsx
src/app/unauthorized/page.tsx
src/lib/auth/helpers.ts
src/hooks/useCurrentUser.ts
src/app/api/team/route.ts
src/app/api/team/[id]/route.ts
```

Test locally:
- [ ] `localhost:3000` → redirects to `/login`
- [ ] Google sign-in with non-ringbooker.com email → `/unauthorized`
- [ ] Google sign-in with ringbooker.com email → dashboard

**✓ Done when:** Auth flow works end-to-end locally.

---

## STEP 4 — Dashboard Layout
**Time: ~2 hours**
**Read: 10_UI_DASHBOARD.md (layout section)**

Create files:
```
src/app/(dashboard)/layout.tsx
src/components/layout/Sidebar.tsx
src/components/layout/TopBar.tsx
src/components/layout/MobileNav.tsx
```

Create placeholder pages:
```
src/app/(dashboard)/page.tsx          → "Pipeline"
src/app/(dashboard)/leads/page.tsx    → "Leads"
src/app/(dashboard)/search/page.tsx   → "Search"
src/app/(dashboard)/demos/page.tsx    → "Demos"
src/app/(dashboard)/analytics/page.tsx → "Analytics"
src/app/(dashboard)/team/page.tsx     → Team (wire from Step 3)
```

**✓ Done when:** Layout renders correctly on mobile (375px) and desktop. Nav links work. Admin-only items hidden from outreacher.

---

## STEP 5 — Job Queue
**Time: ~1 hour**
**Read: 11_WORKER_JOBS.md**

Create files:
```
src/lib/jobs/queue.ts
src/lib/utils/security.ts
scripts/worker.ts             ← stub, just logs job type
```

Test job queue:
```typescript
// Quick test in Node.js REPL:
import { enqueueJob } from './src/lib/jobs/queue'
await enqueueJob('score_lead', { leadId: 'test-123' })
// Check Supabase: jobs table should have 1 row
```

```bash
# Start worker stub:
npm run worker
# Should log: "[Worker] Starting worker-XXXX"
# Should poll and find no jobs
```

Create `vercel.json` with cron config:
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

Create `src/app/api/jobs/worker/route.ts` (Vercel cron backup).

**✓ Done when:** Worker starts, polls DB, logs "no jobs". Enqueue/claim cycle works.

---

## STEP 6 — Search Pipeline
**Time: ~3 hours**
**Read: 03_SEARCH_PIPELINE.md**

Create files:
```
src/lib/providers/serper.ts
src/lib/providers/google-places.ts
src/lib/jobs/handlers/search.ts
src/app/api/search/route.ts
src/app/(dashboard)/search/page.tsx
src/app/(dashboard)/search/SearchPageClient.tsx
src/app/(dashboard)/search/[id]/page.tsx
src/app/(dashboard)/search/[id]/SearchRunDetail.tsx
```

Add `search_run` case to `scripts/worker.ts`.

Test:
```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: Worker
npm run worker

# In browser: go to /search → trigger Houston TX search
# Worker should pick up job and import leads
```

Verify:
```sql
-- In Supabase SQL Editor:
SELECT name, city, phone, website_url, rating, review_count
FROM salon_leads
ORDER BY created_at DESC
LIMIT 10;
```

**✓ Done when:** Search imports 15+ hair salons from Houston, TX.

---

## STEP 7 — Enrichment Pipeline
**Time: ~3 hours**
**Read: 04_ENRICHMENT_PIPELINE.md**

Create files:
```
src/lib/enrichment/platform-detector.ts
src/lib/enrichment/website-crawler.ts
src/lib/jobs/handlers/enrich.ts
src/app/api/leads/[id]/enrich/route.ts
```

Add `enrich_lead` case to worker.

Test crawler manually:
```typescript
// Test against known salon with Square:
import { crawlWebsite } from './src/lib/enrichment/website-crawler'
const result = await crawlWebsite('https://[any-salon-with-square].square.site')
console.log(result.platform_hits)  // Should show square detected
```

**✓ Done when:** `website_snapshots` populated for enriched leads. Platform detected for salons with Square/Vagaro/GlossGenius.

---

## STEP 8 — Scoring Engine
**Time: ~2 hours**
**Read: 06_SCORING_ENGINE.md**

Create files:
```
src/lib/scoring/scoring-engine.ts
src/lib/jobs/handlers/score.ts
src/components/leads/ScoreBadge.tsx
src/components/leads/TierBadge.tsx
src/components/leads/ScoreBreakdown.tsx
src/components/leads/StatusBadge.tsx
src/app/api/leads/[id]/score/route.ts
```

Add `score_lead` case to worker.

Verify scores make sense:
```sql
SELECT l.name, s.score, s.priority, s.tier, s.tier_platform,
       s.factors->>'noOnlineBooking' as no_booking,
       s.factors->>'businessAge' as age
FROM salon_leads l
JOIN lead_scores s ON s.lead_id = l.id
ORDER BY s.score DESC
LIMIT 10;
```

**✓ Done when:** All enriched leads scored. Priority 1 leads have score ≥ 70. Tier A shows for Square/Vagaro leads.

---

## STEP 9 — Instagram Pipeline
**Time: ~3 hours**
**Read: 05_INSTAGRAM_PIPELINE.md**

Create files:
```
src/lib/enrichment/instagram-provider.ts
src/lib/jobs/handlers/instagram.ts
```

Add `enrich_instagram` case to worker.

Test with known salon Instagram:
```typescript
import { fetchInstagramProfile } from './src/lib/enrichment/instagram-provider'
const profile = await fetchInstagramProfile('luxehairsalon')  // replace with real handle
console.log(profile?.detectedPlatform)
console.log(profile?.activeLast30Days)
```

**✓ Done when:** `instagram_snapshots` populated for leads with Instagram URLs. Platform detected from bio links.

---

## STEP 10 — Lead List + Pipeline Pages
**Time: ~4 hours**
**Read: 10_UI_DASHBOARD.md**

Create files:
```
src/app/api/leads/route.ts
src/app/(dashboard)/leads/LeadListClient.tsx
src/app/(dashboard)/PipelineClient.tsx
```

Features to implement:
- Lead list with filters (status, priority, tier, city, search)
- Sort by score (default), rating, review_count
- Pipeline kanban + list toggle
- Overdue follow-ups alert

**✓ Done when:** Lead list shows 15+ leads with score/tier badges. Filters work. Pipeline shows kanban columns.

---

## STEP 11 — Demo Service
**Time: ~2 hours**
**Read: 07_DEMO_SERVICE.md**

Create files:
```
src/lib/demo/demo-service.ts
src/lib/jobs/handlers/auto-demo.ts
src/components/demo/DemoCard.tsx
src/app/api/leads/[id]/demo/route.ts
src/app/api/demos/bulk/route.ts
src/app/api/demos/[id]/status/route.ts
src/app/(dashboard)/demos/page.tsx
src/app/(dashboard)/demos/DemosPageClient.tsx
src/app/api/webhooks/ringbooker/route.ts   ← FUTURE stub
```

Add `auto_create_demo` case to worker.
Wire auto-demo trigger at end of score handler.

**✓ Done when:** Priority 1 leads auto-get demo URLs. Manual "Build Demo" button works. Admin demos page shows needs-demo list.

---

## STEP 12 — Lead Detail Page
**Time: ~4 hours**
**Read: 10_UI_DASHBOARD.md (lead detail section)**

Create files:
```
src/app/api/leads/[id]/route.ts
src/app/(dashboard)/leads/[id]/page.tsx
src/app/(dashboard)/leads/[id]/LeadDetailClient.tsx
```

5 tabs:
1. Overview — contact info, score breakdown, hours, maps link
2. Enrichment — website data, Instagram data, re-enrich button
3. Demo — DemoCard component
4. Activity — timeline + log event modal
5. Notes — auto-save notes + tags

**✓ Done when:** All 5 tabs work. Score breakdown shows 8 factors. Demo card shows URL + copy button.

---

## STEP 13 — Outreach Tracking
**Time: ~4 hours**
**Read: 08_OUTREACH_TRACKING.md**

Create files:
```
src/lib/outreach/outreach-service.ts
src/lib/outreach/evidence-service.ts
src/components/outreach/OutreachTimeline.tsx
src/components/outreach/LogEventModal.tsx
src/components/outreach/FollowUpCard.tsx
src/app/api/outreach/[leadId]/route.ts
src/app/api/evidence/route.ts
src/app/api/follow-ups/route.ts
```

**✓ Done when:**
- [ ] Log DM sent + upload screenshot → timeline shows event with screenshot
- [ ] Mark demo shared → lead status updates to `demo_shared`
- [ ] Schedule follow-up → shows in follow-up card
- [ ] Overdue follow-ups show in red
- [ ] Camera upload works on mobile

---

## STEP 14 — Analytics Page
**Time: ~2 hours**

Create files:
```
src/app/api/analytics/pipeline/route.ts
src/app/api/analytics/team/route.ts
src/app/(dashboard)/analytics/AnalyticsClient.tsx
```

Show:
- Conversion funnel (scored → DM sent → replied → demo → converted)
- By city breakdown
- By tier (A/B/C)
- Per-member performance table (admin only)

**✓ Done when:** Analytics page loads with real data from DB.

---

## STEP 15 — Deploy to Vercel
**Time: ~30 minutes**

```bash
# Push to GitHub
git add .
git commit -m "Initial implementation"
git push origin main
```

1. Go to vercel.com → New Project → Import from GitHub
2. Set environment variables:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INTERNAL_API_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_URL=https://sales.ringbooker.com
NEXTAUTH_SECRET
ALLOWED_EMAIL_DOMAINS=ringbooker.com
```
3. Deploy

4. Update Supabase Auth:
   - Add redirect URL: `https://sales.ringbooker.com/auth/callback`

5. Update Google OAuth:
   - Add authorized redirect URI: `https://sales.ringbooker.com/auth/callback`

**✓ Done when:** `https://sales.ringbooker.com` loads and login works.

---

## STEP 16 — Deploy Worker to Railway
**Time: ~30 minutes**
**Read: 11_WORKER_JOBS.md**

1. Go to railway.app → New Project → Deploy from GitHub repo
2. Railway will auto-detect Node.js
3. Set **Start Command**: `npm run worker`
4. Set environment variables in Railway dashboard:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERPER_API_KEY=xxxx
GOOGLE_PLACES_API_KEY=xxxx
APIFY_API_TOKEN=apify_api_xxxx
WORKER_ID=railway-worker-1
WORKER_POLL_INTERVAL_MS=2000
INTERNAL_API_SECRET=xxxx
```

5. Deploy → check Railway logs:
```
[Worker] Starting railway-worker-1
[Worker] Poll interval: 2000ms
[Worker] Supabase URL: https://xxxx.supabase...
```

6. Trigger a search from the UI → watch Railway logs process the jobs

**✓ Done when:** Railway logs show worker processing jobs 24/7. RingBooker server completely untouched.

---

## End-to-End Test Checklist

After all steps complete:

```
Authentication:
□ Login with Google (ringbooker.com email) → works
□ Non-team email → /unauthorized
□ Invite outreacher → they login → see only assigned leads

Search & Enrichment:
□ Run search: Houston TX, 20 results
□ Leads imported into DB
□ Railway worker picks up enrich_lead jobs
□ website_snapshots populated
□ Platform detected for Square/Vagaro salons
□ Instagram enrichment runs for leads with IG URLs
□ Scores calculated, priority 1 leads identified

Demo:
□ Priority 1 lead auto-gets demo URL
□ Admin manual "Build Demo" button works
□ Demo URL copies to clipboard
□ Mark as shared → status updates

Outreach:
□ Assign lead to outreacher
□ Outreacher logs "DM Sent" + uploads screenshot
□ Screenshot visible in timeline
□ Mark demo shared → status = demo_shared
□ Schedule follow-up → shows in card
□ Overdue follow-up shows in red alert

Access control:
□ Outreacher cannot see unassigned leads
□ Outreacher cannot run search
□ Outreacher cannot see analytics
□ Deactivated user blocked on next request

Mobile:
□ Pipeline page works on 375px iPhone
□ Lead detail tabs scrollable
□ Log event modal opens camera for screenshot
□ Copy demo link button works

Infrastructure:
□ Vercel: sales.ringbooker.com loads fast
□ Railway: worker logs every 2s poll
□ Railway: auto-restarts if worker crashes
□ Supabase: separate project from RingBooker
□ RingBooker server: zero impact, untouched
```

---

## Cost Summary

```
Vercel free tier       → $0/mo   (UI + API routes)
Supabase free tier     → $0/mo   (DB + Auth + Storage)
Railway Hobby          → $5/mo   (Worker 24/7)
─────────────────────────────────
Infrastructure total:  → $5/mo

Usage costs (variable):
Serper API             → ~$1-5/mo   (depends on # searches)
Google Places API      → ~$0-5/mo   (within free $200 credit)
Apify Instagram        → ~$2-10/mo  (depends on # profiles)
─────────────────────────────────
Estimated total:       → $8-20/mo
```

---

## Post-Launch: RingBooker Integration

When ready to connect to ringbooker.com (future):

**Step A — Add internal API to RingBooker:**
```
POST /api/backend/internal/sales/demo-context
→ Returns: demoUrl, requestId, sessionId
```

**Step B — Set env vars on Vercel + Railway:**
```
RINGBOOKER_INTERNAL_API_URL=https://ringbooker.com
RINGBOOKER_INTERNAL_API_KEY=xxxx
```

**Step C — Demo service auto-upgrades:**
```typescript
// demo-service.ts already has the code:
if (apiUrl && apiKey) {
  // Uses real RingBooker API automatically
}
// Stub URL used when not configured
```

**Step D — Add webhook to RingBooker:**
```
RingBooker sends demo events →
POST https://sales.ringbooker.com/api/webhooks/ringbooker
→ Stub handler already in place at correct route
→ Just implement the handler
```

No architecture changes needed. Everything already wired.
