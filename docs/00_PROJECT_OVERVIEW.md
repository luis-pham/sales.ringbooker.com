# 00 — Project Overview
> sales.ringbooker.com | Internal Sales Intelligence Tool
> Version: 1.0 | 2026-06-02

---

## What is this?

`sales.ringbooker.com` is an **internal outreach tool** for the RingBooker team.

**Core workflow:**
1. Search hair salons on Google Maps (Serper API)
2. Auto-enrich: website crawl, platform detection, Instagram
3. Score and prioritize leads (8-factor model)
4. Create personalized web demo URL per salon
5. Assign leads to outreach team members
6. Track: DM sent → demo shared → replied → converted
7. Evidence collection: screenshots at each step

**Users:**
- `admin` — RingBooker founder (full access)
- `outreacher` — hired team members who send DMs (limited access)

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 App Router + TypeScript | Familiar, full-stack |
| Database | Supabase (Postgres + Auth + Storage + Realtime) | All-in-one, RLS built-in |
| Styling | Tailwind CSS v4 | Utility-first, consistent |
| Components | shadcn/ui | Modern SaaS aesthetic |
| Icons | Lucide React | Clean, consistent |
| Validation | Zod | Type-safe validation |
| HTTP | Native fetch | No overhead |
| Crawling | Cheerio | Lightweight HTML parsing |
| Workers | Node.js + tsx | Background job processing |
| File storage | Supabase Storage | Screenshots, evidence |
| Deployment | Vercel | Easy, fast |

---

## Design System

### Philosophy
Clean, minimal, professional — like Linear, Notion, or Vercel dashboard.
No clutter. Data-dense but readable. Mobile-first.

### Colors
```
Primary:     violet-600  (#7c3aed)
Primary dark: violet-700  (#6d28d9)
Success:     emerald-600 (#059669)
Warning:     amber-500   (#f59e0b)
Danger:      red-500     (#ef4444)
Background:  slate-50    (#f8fafc)  light mode
Surface:     white       (#ffffff)
Border:      slate-200   (#e2e8f0)
Text:        slate-900   (#0f172a)
Muted:       slate-500   (#64748b)
```

### Typography
```
Font: Inter (Google Fonts)
Weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

Sizes:
  xs:   11px — labels, badges
  sm:   13px — secondary text, table cells
  base: 14px — body text
  lg:   16px — section headers
  xl:   20px — page titles
  2xl:  24px — dashboard metrics
```

### Spacing (4px base unit)
```
xs:  4px
sm:  8px
md:  12px
lg:  16px
xl:  24px
2xl: 32px
3xl: 48px
```

### Components
```
Border radius:
  sm:   6px  — badges, tags
  md:   8px  — inputs, buttons
  lg:   12px — cards
  xl:   16px — modals, sheets
  full: 9999px — pills, avatars

Shadows:
  card:   0 1px 3px rgba(0,0,0,0.1)
  modal:  0 20px 60px rgba(0,0,0,0.15)
  focus:  0 0 0 3px rgba(124,58,237,0.2)

Input height: 40px minimum (prevents iOS zoom)
Button height: 36px (sm), 40px (md), 44px (lg)
```

### Score badges
```
score >= 70  → emerald  background — "High" — Priority 1
score 50-69  → amber    background — "Med"  — Priority 2
score < 50   → slate    background — "Low"  — Priority 3
```

### Tier badges
```
Tier A (Square/Vagaro) → violet  — "Full Sync"
Tier B (GlossGenius)   → blue    — "Link Only"
Tier C (No platform)   → slate   — "Manual"
```

### Outreach status colors
```
new               → slate
dm_sent           → blue
replied           → violet
demo_shared       → indigo
demo_viewed       → cyan
demo_completed    → teal
follow_up_needed  → amber
converted         → emerald
lost              → red
disqualified      → slate
```

---

## Environment Variables

```env
# ─── Supabase ───────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only, never expose to client

# ─── Auth ───────────────────────────────────────────────
NEXTAUTH_SECRET=random-32-char-string  # openssl rand -base64 32
NEXTAUTH_URL=https://sales.ringbooker.com
ALLOWED_EMAIL_DOMAINS=ringbooker.com   # comma-separated

# ─── Google OAuth ───────────────────────────────────────
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx

# ─── Search Providers ───────────────────────────────────
SERPER_API_KEY=xxxx
GOOGLE_PLACES_API_KEY=xxxx

# ─── Instagram ──────────────────────────────────────────
APIFY_API_TOKEN=apify_api_xxxx

# ─── Internal ───────────────────────────────────────────
INTERNAL_API_SECRET=random-64-char-string  # openssl rand -hex 32
WORKER_POLL_INTERVAL_MS=2000
WORKER_ID=worker-1  # unique per worker instance

# ─── [FUTURE] RingBooker Integration ────────────────────
# RINGBOOKER_INTERNAL_API_URL=https://ringbooker.com
# RINGBOOKER_INTERNAL_API_KEY=xxxx
# RINGBOOKER_WEBHOOK_SECRET=xxxx
```

---

## Project Structure

```
sales.ringbooker.com/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── invite/
│   │   │       └── [token]/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Pipeline
│   │   │   ├── search/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── team/
│   │   │   │   └── page.tsx          # Admin only
│   │   │   └── analytics/
│   │   │       └── page.tsx          # Admin only
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── search/route.ts
│   │       ├── leads/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── enrich/route.ts
│   │       │       ├── score/route.ts
│   │       │       ├── demo/route.ts
│   │       │       └── assign/route.ts
│   │       ├── outreach/
│   │       │   └── [leadId]/route.ts
│   │       ├── evidence/
│   │       │   └── route.ts          # Screenshot upload
│   │       ├── follow-ups/
│   │       │   └── route.ts
│   │       ├── team/
│   │       │   ├── route.ts          # List/invite users
│   │       │   └── [id]/route.ts     # Update/remove user
│   │       ├── jobs/
│   │       │   └── worker/route.ts
│   │       └── webhooks/
│   │           └── ringbooker/route.ts  # [FUTURE]
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser client
│   │   │   ├── server.ts             # Server client
│   │   │   └── admin.ts              # Service role client
│   │   ├── auth/
│   │   │   ├── config.ts
│   │   │   └── helpers.ts
│   │   ├── providers/
│   │   │   ├── serper.ts
│   │   │   └── google-places.ts
│   │   ├── enrichment/
│   │   │   ├── website-crawler.ts
│   │   │   ├── platform-detector.ts
│   │   │   └── instagram-provider.ts
│   │   ├── scoring/
│   │   │   └── scoring-engine.ts
│   │   ├── demo/
│   │   │   └── demo-service.ts
│   │   ├── outreach/
│   │   │   └── outreach-service.ts
│   │   ├── jobs/
│   │   │   ├── queue.ts
│   │   │   └── handlers/
│   │   │       ├── search.ts
│   │   │       ├── enrich.ts
│   │   │       ├── instagram.ts
│   │   │       └── score.ts
│   │   └── utils/
│   │       ├── format.ts
│   │       ├── validate.ts
│   │       └── security.ts
│   ├── components/
│   │   ├── ui/                       # shadcn/ui base
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── leads/
│   │   │   ├── LeadCard.tsx
│   │   │   ├── LeadList.tsx
│   │   │   ├── LeadDetail.tsx
│   │   │   ├── ScoreBadge.tsx
│   │   │   ├── TierBadge.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── outreach/
│   │   │   ├── OutreachTimeline.tsx
│   │   │   ├── LogEventModal.tsx
│   │   │   └── EvidenceUpload.tsx
│   │   ├── demo/
│   │   │   └── DemoCard.tsx
│   │   ├── pipeline/
│   │   │   ├── PipelineBoard.tsx
│   │   │   └── PipelineColumn.tsx
│   │   └── team/
│   │       ├── TeamTable.tsx
│   │       └── InviteModal.tsx
│   ├── hooks/
│   │   ├── useLeads.ts
│   │   ├── useOutreach.ts
│   │   └── useCurrentUser.ts
│   └── types/
│       └── index.ts
├── scripts/
│   └── worker.ts
├── supabase/
│   └── migrations/
│       ├── 001_profiles.sql
│       ├── 002_invitations.sql
│       ├── 003_search_runs.sql
│       ├── 004_salon_leads.sql
│       ├── 005_snapshots.sql
│       ├── 006_scores.sql
│       ├── 007_demos.sql
│       ├── 008_outreach.sql
│       ├── 009_evidence.sql
│       ├── 010_follow_ups.sql
│       └── 011_jobs.sql
├── public/
├── .env.local
├── .env.example
├── middleware.ts
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Key Principles for AI Implementation

1. **Security first** — every route checks auth + role + ownership
2. **Mobile first** — all UI works perfectly on 375px screens
3. **Optimistic UI** — update UI immediately, sync in background
4. **Type safety** — Zod validation on all API inputs
5. **RLS everywhere** — Supabase Row Level Security on all tables
6. **Never expose secrets** — service role key server-side only
7. **Graceful errors** — never crash, always show meaningful error states
8. **Progressive enhancement** — works without JavaScript for core flows

---

## Dependencies to Install

```bash
npx create-next-app@latest sales-ringbooker \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd sales-ringbooker

# Core
npm install @supabase/supabase-js @supabase/ssr
npm install next-auth@beta @auth/supabase-adapter
npm install zod

# UI
npm install lucide-react
npm install class-variance-authority clsx tailwind-merge
npx shadcn@latest init
npx shadcn@latest add button input label card badge
npx shadcn@latest add dialog sheet dropdown-menu
npx shadcn@latest add table tabs avatar skeleton
npx shadcn@latest add toast sonner progress separator
npx shadcn@latest add select textarea switch

# Crawling
npm install cheerio
npm install @types/cheerio --save-dev

# Worker
npm install tsx --save-dev

# Utils
npm install date-fns
npm install @tanstack/react-query
```
