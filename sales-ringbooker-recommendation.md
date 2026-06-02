# Sales RingBooker Recommendation

Ngay: 2026-06-02

Pham vi: audit read-only hai codebase `ringbooker.com` va `leadmapfinder.com`; khong run project, khong sua source app. File nay la output duy nhat.

## 1. Ket luan ngan

Khuyen nghi: **Option B - tao project moi `sales.ringbooker.com`, copy co chon loc module lead discovery tu LeadMapFinder, va ket noi RingBooker bang internal API**.

Ly do:

- RingBooker da co demo/session/call tracking tot, nhung no la product runtime lon va dang co isolation rieng cho demo. Dua Google Maps scraping, Instagram scraping, outreach CRM vao RingBooker se lam tang risk cho production.
- LeadMapFinder co nhieu module tim lead dung duoc, nhung full app qua nang cho internal sales tool 2-3 nguoi. Fork nguyen codebase se keo theo auth, Drizzle schema, pipeline, enrichment, billing/admin phuc tap khong can thiet.
- Project moi giu sales tool gon, co schema Supabase rieng, reuse duoc `providers`, `platform-detection`, website extractors, va de deploy thanh subdomain noi bo.
- Dieu kien quan trong: RingBooker can them **internal demo API** nho de sales tool tao demo context va nhan call events. API public hien tai khong du de sales app goi truc tiep mot cach sach.

## 2. Option A/B/C

| Option | Danh gia | Uu diem | Nhuoc diem | Khuyen nghi |
|---|---:|---|---|---|
| A. Build trong RingBooker | Feasible nhung risk cao | Co san demo runtime, Telnyx/OpenAI/LiveKit, admin demo tracking | Tron scraping/outreach vao product app; auth/admin/routing phuc tap; de anh huong production | Khong nen lam full sales app trong RingBooker |
| B. Project moi + copy module LeadMapFinder + RingBooker API | Tot nhat | Gon, tach rui ro, nhanh cho MVP, van dung demo RingBooker lam source of truth | Can them internal API/bridge trong RingBooker | **Nen chon** |
| C. Fork LeadMapFinder va strip down | Medium-low | Co san nhieu pipeline/search UI | Qua nhieu code thua, schema Drizzle/auth/pipeline lon, cleanup ton thoi gian | Chi nen dung neu chap nhan technical debt ngan han |

## 3. Audit RingBooker

### 3.1 Kien truc backend/API

API Next catch-all nam o:

- `app/api/backend/[[...route]]/route.ts`
- Hono app chinh: `src/backend/api/app.ts`
- Runtime base path: `/api/backend`

Vi vay route trong Hono `path('/public/demo/web-session')` se la:

- `POST /api/backend/public/demo/web-session`

### 3.2 Co API tao demo shop khong?

**Khong co API san de tao mot demo shop moi va tra ve demo phone number rieng cho tung salon.**

Nhung RingBooker co 3 dong demo:

| Endpoint | File | Muc dich | Auth/rang buoc | Return | Reuse cho sales |
|---|---|---|---|---|---|
| `POST /api/backend/public/demo/web-session` | `src/backend/api/app.ts:4214` | Tao browser voice demo bang LiveKit/OpenAI cho public landing demo | Rate limit, Turnstile, origin check, can `PUBLIC_DEMO_SHOP_ID` | `ok`, `requestId`, `previewToken`, `roomName`, `liveKitUrl`, `liveKitToken`, `mode` | Dung cho web demo, khong tao phone demo |
| `POST /api/backend/public/demo/realtime-session` | `src/backend/api/app.ts:3698` | Tao direct OpenAI Realtime browser session | Rate limit, Turnstile/origin, public demo security | `ok`, `requestId`, `clientSecret`, `expiresAt`, `model`, `voice` | Dung cho browser demo nhanh, khong phone |
| `POST /api/backend/public/demo/sip-prep` | `src/backend/api/app.ts:4473` | Luu demo context cho inbound SIP demo DID | Rate limit, Turnstile/origin, can visitor phone | `ok`, `publicSessionId` | Gan voi demo phone tinh, nhung chua phai internal sales API |
| `POST /api/backend/public/demo/request` | `src/backend/api/app.ts:3675` | Legacy outbound demo | Disabled | HTTP 410 `outbound_demo_disabled` | Khong dung |
| `POST /api/backend/admin/shops` | `src/backend/api/app.ts:11195` | Tao real production shop | Admin session + CSRF | Shop record | Khong dung de tao demo sales |

Input public demo gom cac truong chinh:

- `shopName`
- `businessType`
- `demoVertical`: `nail-salon`, `hair-salon`, `day-spa`, `med-spa`, `beauty-clinic`
- `demoMode`: `quick`, `advanced`, `free-form`
- `demoSource`
- `staffName`
- `notes`
- `demoConfig`: `city`, `primaryHours`, `secondaryHours`, `staffNames[]`, `services[]`
- `captchaToken`, `sessionId`, honeypot `website`
- Rieng `sip-prep` co `phoneNumber`

Phone demo khong duoc provision dong theo salon. Mapping demo DID nam o:

- `src/backend/demo/demo-vertical-phone-map.ts`

Env lien quan:

- `DEMO_PHONE_HAIR_SALON`
- `DEMO_PHONE_NAIL_SALON`
- `DEMO_PHONE_DAY_SPA`
- `DEMO_PHONE_MED_SPA`
- `DEMO_PHONE_BEAUTY_CLINIC`
- `OPENAI_SIP_DEMO_DID_MAP_JSON`
- `DEMO_PHONE_FALLBACK_VERTICAL`

Ket luan: sales tool nen tao demo context va gan salon voi **static hair salon demo DID**, khong nen co gang tao production shop/demo shop moi qua admin shop API.

### 3.3 Demo call tracking trong RingBooker

RingBooker da co isolation tot cho demo calls:

- Migration demo tables: `src/backend/db/migrations/0012_demo_experience_isolation.sql`
- Web demo sessions: `src/backend/db/migrations/0030_web_demo_sessions.sql`
- Transcript demo calls: `src/backend/db/migrations/0058_demo_call_runs_transcript.sql`
- Repository interface: `src/backend/ports/repositories.ts`
- Supabase adapter: `src/backend/adapters/supabase/demo-sessions-repository.ts`

Bang demo quan trong:

- `demo_sessions`
- `demo_business_configs`
- `demo_services`
- `demo_call_runs`
- `demo_sms_runs`
- `demo_status_events`
- `web_demo_sessions`

Call status duoc cap nhat tu:

- Telnyx webhook: `src/backend/api/app.ts:3171`, handler `src/backend/webhooks/telnyx.ts`
- Telnyx inbound TeXML/SIP: `src/backend/api/app.ts:3191`, handler `src/backend/webhooks/telnyx-texml-openai-inbound.ts`
- Agent dispatch status: `src/backend/api/app.ts:12743`
- Admin list demo calls: `GET /api/backend/admin/demo-calls` o `src/backend/api/app.ts:11843`
- Admin transcript: `GET /api/backend/admin/demo-calls/:requestId/transcript` o `src/backend/api/app.ts:12155`

Trang thai demo call da co:

- `queued`
- `dialing`
- `live`
- `completed`
- `missed`
- `failed`

Du lieu tracking co the lay ra:

- `requestId`
- `publicSessionId`
- `providerCallId`
- `roomName`
- `status`
- `startedAt`, `connectedAt`, `endedAt`
- `outcome`
- `transcript`, `transcriptStatus`

### 3.4 Shop model RingBooker

Shop production nam trong `src/backend/domain/types.ts`, co nhieu field cho business that:

- identity: `id`, `name`, `vertical`, `brand_slug`
- phone: `phone_number`, `user_phone`, `handoff_phone`, `telnyx_number`
- ops: `services`, `service_catalog`, `staff`, `hours`, `faqs`
- booking/integrations: `booking_url`, `booking_method`, `selected_integration`, Vagaro/Acuity/Google Calendar fields
- AI config: `ai_voice`, `ai_welcome_message`, `ai_custom_instructions`
- plan/onboarding/commercial flags

Khong thay flag don gian kieu `is_demo_shop`. Demo da duoc tach khoi production `shops` bang cac bang `demo_*`.

### 3.5 RingBooker can them gi de sales.ringbooker.com dung tot?

Can them mot API nho trong RingBooker, khong can copy demo runtime ra sales app:

`POST /api/backend/internal/sales/demo-context`

- Auth: `X-Internal-Api-Key` hoac HMAC signature, chi allow tu sales app.
- Input: `salesLeadId`, `salonName`, `phone`, `websiteUrl`, `instagramUrl`, `city`, `hours`, `services`, `staffNames`, `notes`, `demoVertical=hair-salon`.
- Action: tao `demo_session`, `demo_business_config`, `demo_services`, optional `demo_status_event`.
- Return: `requestId`, `publicSessionId`, `demoVertical`, `demoPhoneNumber`, `expiresAt`, `instructions`.

`POST /api/backend/internal/sales/demo-events` hoac webhook outbound tu RingBooker sang sales app:

- Gui event khi `demo_call_runs` doi status: `queued/live/completed/missed/failed`.
- Payload: `requestId`, `publicSessionId`, `status`, `providerCallId`, `startedAt`, `connectedAt`, `endedAt`, `outcome`, `transcriptStatus`.

Khong nen dung admin shop API cho flow nay vi no tao real shop va yeu cau admin session + CSRF.

## 4. Audit LeadMapFinder

### 4.1 Google Maps providers

Reusable cao.

Files:

- `src/lib/lead-intelligence/providers/serper-provider.ts`
- `src/lib/lead-intelligence/providers/google-places-provider.ts`
- `src/lib/lead-intelligence/types.ts`
- `src/lib/lead-intelligence/providers/index.ts`

Serper provider:

- Endpoint: `POST https://google.serper.dev/maps`
- Env: `SERPER_API_KEY`
- Page size 20, max 100
- Ho tro `gl`, `hl`, location bias `ll=@lat,lng,14z`
- Dedupe theo place id, phone, website, name+address
- Tra duoc: name, phone, website, address, coordinates, rating, review count, categories, maps URL
- Cost estimate trong code: khoang `$0.001/query`

Google Places provider:

- Endpoint search: `POST https://places.googleapis.com/v1/places:searchText`
- Env: `GOOGLE_PLACES_API_KEY`
- Search fields gom id/name/address/location/rating/review count/business status/types/maps URL
- Place Details co phone, website, opening hours, reviews
- Search khong lay phone/website/hours neu khong goi detail
- Cost estimate trong code: khoang `$0.032/query`

Khuyen nghi cho MVP:

- Dung **Serper** neu can nhanh, re, co phone/website tu search result.
- Dung **Google Places Details** cho top N lead de lay website/hours chuan hon.

### 4.2 Platform detection

Reusable cao.

Files:

- `src/lib/lead-intelligence/platform-detection/detect-platforms.ts`
- `src/lib/lead-intelligence/platform-detection/platform-registry.ts`
- `src/lib/lead-intelligence/platform-detection/types.ts`

No detect duoc:

- Booking platforms: Fresha, Vagaro, Booksy, GlossGenius, Mindbody, Square Appointments, Boulevard, Zenoti, Mangomint, Phorest, Meevo
- Scheduling: Acuity, Calendly
- Website builders: WordPress, Wix, Squarespace, Webflow, Shopify
- CRM/forms/chat va mot so platform khac

Input la HTML/link/script/iframe/form/meta/text signals. Neu Instagram bio co booking link, sales app co the feed link do vao detector de detect platform, nhung LeadMapFinder khong co Instagram discovery/scrape hoan chinh.

### 4.3 Website crawl/extraction

Full pipeline qua nang cho MVP, nhung extractors dung duoc.

Files nen reuse:

- `src/lib/lead-intelligence/website-signals/extractors/booking-extractor.ts`
- `src/lib/lead-intelligence/website-signals/extractors/contact-extractor.ts`
- `src/lib/lead-intelligence/platform-detection/detect-platforms.ts`
- `src/lib/lead-intelligence/platform-detection/platform-registry.ts`

File nen dung lam reference, khong copy nguyen:

- `src/lib/lead-intelligence/website-signals/run-website-signal-pipeline.ts`

Logic can lay cho MVP:

- Fetch homepage HTML.
- Extract phone/email/contact links.
- Extract booking links/iframes.
- Extract Instagram/social links.
- Detect booking platform.
- Optionally crawl toi da 2 page noi bo: `/contact`, `/services`, `/book`, `/booking`, neu homepage chua ro.

Khong nen copy cac phan sau cho sales MVP:

- LLM extraction
- Jina/trafilatura/rendering phuc tap
- sitemap crawling sau
- service vision/pricing/SEO deep analysis
- review pain profiling day du
- deterministic probes nang

Thoi gian uoc tinh:

- Homepage-only static crawl: 1-3 giay/site neu timeout tot.
- Homepage + 2 internal pages: 3-8 giay/site.
- Full LeadMap pipeline: qua dai va khong can cho 10-100 salon dau tien.

### 4.4 Queue/worker

Prompt path `src/lib/lead-intelligence/pipeline/jobs/pipeline-queue.ts` khong ton tai. File thuc te:

- `src/lib/lead-intelligence/jobs/pipeline-queue.ts`
- `scripts/worker.ts`

Queue hien tai:

- `enqueuePipelineJob`
- `claimNextPipelineJob`
- release stale processing jobs
- retry voi exponential backoff
- update `lead_search_runs`
- ghi event/usage ledger khi fail/retry

Nhan xet:

- Neu fork LeadMapFinder/giu Drizzle schema thi co the reuse.
- Neu tao project moi voi Supabase JS thi nen build queue don gian hon: 1 bang `jobs`, cron/worker claim job bang status + locked_at.

### 4.5 Auth

LeadMapFinder auth day du nhung qua nang cho internal tool.

Files:

- `src/auth.ts`
- `src/app/api/auth/register/route.ts`
- `src/lib/auth/admin-auth.ts`
- `src/lib/auth/api-access.ts`

Hien tai gom:

- NextAuth/Auth.js
- DrizzleAdapter
- Credentials provider
- optional Google provider
- bcrypt
- email verification
- admin token fallback `LEADMAP_ADMIN_TOKEN`

Khuyen nghi:

- Cho 2-3 internal users, dung Supabase Auth voi allowlist email, hoac Vercel protected deployment + app-level admin token.
- Khong copy full NextAuth/Auth.js + registration/email verification cua LeadMapFinder vao MVP.

### 4.6 Instagram

LeadMapFinder **khong co module Instagram discovery/scraping du manh** cho yeu cau sales.

Co san:

- Website social link classifier co the tim Instagram URL/handle tu website.
- `src/lib/lead-intelligence/advanced-enrichment/sources/social-profile-enricher.ts` co heuristic crawl Instagram khi `LEADMAP_SOCIAL_CRAWL_ENABLED=true`.

Han che:

- Khong co search Instagram theo salon/city.
- Khong co API on dinh lay recent posts, bio link, followers.
- Crawl Instagram HTML bang renderer rat de vo/rate-limit.

Can build rieng:

- Instagram enrichment provider qua Apify/RapidAPI/outsourced data provider.
- Input: salon name, city, website social links.
- Output: `handle`, `profileUrl`, `bio`, `bioLinks`, `followers`, `lastPostAt`, `activeLast30Days`, `bookingLinkInBio`, `confidence`.

### 4.7 Dependencies

LeadMapFinder dependencies lien quan:

- `next`, `react`, `react-dom`
- `zod`
- `cheerio`
- `apify-client`
- `drizzle-orm`, `postgres`
- `next-auth`, `@auth/drizzle-adapter`, `bcryptjs`
- `resend`
- `puppeteer-core`

Cho sales MVP nen dung:

- Next.js + React
- Supabase Postgres + Supabase JS/Auth
- Zod
- Cheerio
- Serper hoac Google Places
- Apify client neu lam Instagram

Co the bo:

- Drizzle neu dung Supabase JS truc tiep
- NextAuth/Auth.js neu dung Supabase Auth
- Puppeteer-core o giai doan dau
- Resend neu chua can email automation

## 5. Scoring model

Prompt noi "5 factors" nhung danh sach co **8 factors**, tong dung 100 diem. Nen implement 8 factors va luu confidence/data availability rieng.

| Factor | Diem | Data source | Do san sang |
|---|---:|---|---|
| No online booking link | 25 | Website crawl + platform detection + Instagram bio link | San sang neu crawl website; Instagram bio can provider rieng |
| Business age 3+ years | 15 | Oldest review date hoac business profile data | Chua san sang bang Google basic; can review provider |
| Rating 4.0-4.5 | 15 | Serper/Google Places search | San sang |
| Review count 50-300 | 10 | Serper/Google Places search | San sang |
| After-hours gap: closes before 6PM / no Sunday | 10 | Google Place Details opening hours + website hours | Can Place Details |
| Instagram active | 10 | Instagram enrichment provider | Can build/buy |
| Has website | 8 | Serper search hoac Google Place Details | San sang neu provider tra website |
| Responds to reviews | 7 | Review data co owner response | Chua san sang bang Google basic; can review provider |

Recommendation scoring cho MVP:

- Implement engine don gian tu dau, khong copy full `src/lib/lead-intelligence/scoring/scoring-engine.ts`.
- Unknown factor khong nen mac dinh thanh 0 ma nen luu `unknown` va `score_confidence`.
- Display score gom 2 cot: `score` va `confidence`.
- Week 1 co the score bang 6 factor san sang hon: no booking, rating, review count, hours, Instagram active neu provider co, website. Business age va owner review response de phase 2.

Pseudo model:

```ts
type ScoreFactor =
  | "no_online_booking"
  | "business_age_3y"
  | "rating_4_0_to_4_5"
  | "review_count_50_300"
  | "after_hours_gap"
  | "instagram_active"
  | "has_website"
  | "responds_to_reviews";

type ScoreResult = {
  total: number;
  confidence: number;
  factors: Array<{
    key: ScoreFactor;
    points: number;
    maxPoints: number;
    status: "matched" | "not_matched" | "unknown";
    evidence?: string;
  }>;
};
```

## 6. Modules nen reuse/copy

| Source | Files | Reuse | Effort |
|---|---|---|---:|
| LeadMapFinder Google/Serper providers | `src/lib/lead-intelligence/providers/serper-provider.ts`, `google-places-provider.ts`, `types.ts` | Copy gan nhu truc tiep, chinh env/config va types | 0.5-1 ngay |
| LeadMapFinder platform detection | `platform-detection/detect-platforms.ts`, `platform-registry.ts`, `types.ts` | Copy gan nhu truc tiep | 0.5-1 ngay |
| LeadMapFinder website extractors | `website-signals/extractors/booking-extractor.ts`, `contact-extractor.ts` | Copy va bo dependencies khong can | 1-2 ngay |
| LeadMapFinder full website pipeline | `run-website-signal-pipeline.ts` | Dung lam reference, khong copy nguyen | 0.5 ngay doc/reference |
| LeadMapFinder queue | `jobs/pipeline-queue.ts`, `scripts/worker.ts` | Rebuild simple queue theo y tuong | 0.5-1 ngay |
| LeadMapFinder scoring | `scoring/scoring-engine.ts` | Dung concept, build scoring moi | 0.5 ngay |
| RingBooker demo runtime | `src/backend/api/app.ts`, `demo-sessions-repository.ts`, demo migrations/webhooks | Khong copy; giu trong RingBooker va expose internal API | 1-2 ngay cho API bridge |
| RingBooker call tracking | Telnyx/agent dispatch/admin demo routes | Khong copy; sync event sang sales app | 1 ngay |

## 7. Modules build from scratch

Can build rieng trong `sales.ringbooker.com`:

- Lead search UI: city/query/run controls.
- Lead list + detail page.
- Simple job runner/cron.
- Minimal website crawler wrapper.
- Instagram enrichment provider wrapper.
- 8-factor scoring engine.
- Outreach tracker: statuses `new`, `qualified`, `dm_sent`, `demo_prepared`, `demo_called`, `replied`, `converted`, `lost`.
- RingBooker internal API client.
- Demo/call event sync.
- Notes/tasks/follow-up UI.

## 8. Proposed Supabase schema, max 10 tables

Dung Supabase Auth cho user; app schema gom 10 bang:

### 1. `profiles`

- `id uuid primary key references auth.users(id)`
- `email text unique not null`
- `role text not null check (role in ('admin','sales'))`
- `created_at timestamptz default now()`

### 2. `lead_search_runs`

- `id uuid primary key`
- `query text not null`
- `city text`
- `state text`
- `provider text not null`
- `status text not null`
- `requested_by uuid references profiles(id)`
- `created_at timestamptz default now()`
- `completed_at timestamptz`
- `error text`

### 3. `salon_leads`

- `id uuid primary key`
- `search_run_id uuid references lead_search_runs(id)`
- `name text not null`
- `phone text`
- `website_url text`
- `instagram_url text`
- `address text`
- `city text`
- `state text`
- `lat double precision`
- `lng double precision`
- `rating numeric`
- `review_count integer`
- `google_place_id text`
- `status text not null default 'new'`
- `owner_id uuid references profiles(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### 4. `lead_source_snapshots`

- `id uuid primary key`
- `lead_id uuid references salon_leads(id) on delete cascade`
- `provider text not null`
- `provider_id text`
- `raw jsonb not null`
- `created_at timestamptz default now()`

### 5. `website_snapshots`

- `id uuid primary key`
- `lead_id uuid references salon_leads(id) on delete cascade`
- `url text not null`
- `status text not null`
- `phones jsonb`
- `emails jsonb`
- `booking_urls jsonb`
- `platform_hits jsonb`
- `hours jsonb`
- `cta_strength text`
- `created_at timestamptz default now()`

### 6. `instagram_snapshots`

- `id uuid primary key`
- `lead_id uuid references salon_leads(id) on delete cascade`
- `handle text`
- `profile_url text`
- `followers integer`
- `bio text`
- `bio_links jsonb`
- `last_post_at timestamptz`
- `active_last_30_days boolean`
- `booking_link_in_bio boolean`
- `confidence numeric`
- `raw jsonb`
- `created_at timestamptz default now()`

### 7. `lead_scores`

- `id uuid primary key`
- `lead_id uuid references salon_leads(id) on delete cascade`
- `score integer not null`
- `confidence numeric not null`
- `factors jsonb not null`
- `version text not null`
- `created_at timestamptz default now()`

### 8. `ringbooker_demos`

- `id uuid primary key`
- `lead_id uuid references salon_leads(id) on delete cascade`
- `ringbooker_request_id text unique`
- `public_session_id text`
- `demo_vertical text default 'hair-salon'`
- `demo_phone_number text`
- `status text not null default 'prepared'`
- `prepared_payload jsonb`
- `last_event_at timestamptz`
- `created_by uuid references profiles(id)`
- `created_at timestamptz default now()`

### 9. `outreach_events`

- `id uuid primary key`
- `lead_id uuid references salon_leads(id) on delete cascade`
- `demo_id uuid references ringbooker_demos(id) on delete set null`
- `type text not null`
- `channel text`
- `notes text`
- `payload jsonb`
- `created_by uuid references profiles(id)`
- `created_at timestamptz default now()`

### 10. `jobs`

- `id uuid primary key`
- `type text not null`
- `status text not null default 'pending'`
- `payload jsonb not null`
- `attempts integer not null default 0`
- `max_attempts integer not null default 3`
- `locked_at timestamptz`
- `locked_by text`
- `next_run_at timestamptz default now()`
- `error text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

## 9. Tech stack khuyen nghi

- App: Next.js 15 + React.
- DB: Supabase Postgres.
- Auth: Supabase Auth + email allowlist, hoac Vercel protected deployment cho ban internal dau tien.
- Data API: Serper Maps cho discovery nhanh; Google Places Details cho top leads can hours/website chuan.
- Website extraction: `fetch` + Cheerio + copied extractors/platform detector.
- Instagram: Apify/RapidAPI provider wrapper, khong crawl HTML Instagram bang tay cho production.
- Worker: Vercel cron cho nho; neu job nhieu thi Node worker rieng claim tu `jobs`.
- RingBooker integration: server-side internal API client voi secret, khong expose public key tren client.

## 10. Uoc tinh build time

Cho MVP noi bo 1 dev:

| Hang muc | Estimate |
|---|---:|
| Project setup, Supabase schema, auth | 1-2 ngay |
| Google/Serper lead search | 1 ngay |
| Website crawler + platform detection | 2-3 ngay |
| Scoring engine + score UI | 1 ngay |
| Instagram provider wrapper | 2-4 ngay tuy provider |
| RingBooker internal demo API/bridge | 1-2 ngay |
| Demo/call event sync | 1 ngay |
| Outreach CRM UI | 2-3 ngay |
| Hardening/logging/manual QA | 1-2 ngay |

Tong: **10-15 engineering days**, tuc khoang **2-3 calendar weeks** cho MVP dung duoc noi bo.

Neu bo Instagram automation o phase 1 va nhap/tim Instagram thu cong cho top 10 lead, co the co ban demo trong **5-7 ngay**.

## 11. Rui ro va dependency

- RingBooker public demo API hien tai co Turnstile/origin/rate-limit va khong tra demo phone rieng. Can internal API moi de sales tool dung sach.
- Demo phone la static per vertical, khong dynamic per salon. Can mapping `lead_id <-> requestId/publicSessionId` de biet ai da goi demo.
- Instagram automation co risk ve rate-limit/ToS/chat luong data. Nen dung provider co billing/SLA.
- Business age 3+ years va owner response rate khong co san tu Google basic. Can review provider neu muon score du 100 voi confidence cao.
- Website crawl co site chan bot, timeout, SPA render. Week 1 nen static fetch + fallback manual.
- Fork LeadMapFinder se keo theo nhieu code khong can va tang thoi gian cleanup.
- Build trong RingBooker co risk tac dong production va lam product codebase bi sales-specific logic.

## 12. Week 1 milestone

Muc tieu: **co the tim va xu ly 10 hair salon leads dau tien, tao demo context RingBooker, track outreach bang tay/co ban.**

Deliverables:

- New `sales.ringbooker.com` app skeleton.
- Supabase schema 10 bang nhu tren.
- Auth internal cho 2-3 users.
- Search run: `hair salons in {city}` qua Serper hoac Google Places.
- Import 20-50 leads vao `salon_leads`.
- Place Details cho top leads de lay website/hours khi can.
- Homepage crawl de detect phone, booking URL, platform, Instagram URL.
- Scoring v0 voi factor evidence + confidence.
- Lead list sortable by score/status.
- Lead detail co website/Instagram/booking evidence.
- Manual outreach status: `dm_sent`, `demo_called`, `replied`, `converted`, `lost`.
- RingBooker internal endpoint hoac tam thoi `sip-prep` flow de tao demo context cho 10 salon.
- `ringbooker_demos` luu `requestId/publicSessionId/demoPhoneNumber`.

Definition of done week 1:

- Chay duoc 1 search city.
- Co it nhat 10 hair salon leads co score.
- Moi lead top 10 co evidence: rating, review count, website yes/no, booking link yes/no, hours neu co.
- Tao duoc demo context RingBooker cho top 10.
- Sales user thay ro salon nao da DM, salon nao da call demo, salon nao reply.

## 13. Final recommendation

Chon **Option B**.

Implementation shape nen la:

1. `sales.ringbooker.com` la app rieng, schema rieng, auth noi bo.
2. Copy co chon loc tu LeadMapFinder: Google/Serper providers, platform detector, booking/contact extractors.
3. Build moi: scoring, outreach tracker, jobs, Instagram provider wrapper.
4. RingBooker chi expose internal API cho demo context va demo call events; khong copy Telnyx/OpenAI/LiveKit runtime ra sales app.
5. Week 1 tap trung 10 hair salons dau tien, uu tien manual-friendly workflow hon automation qua sau.

Day la cach nhanh nhat de co sales tool dung duoc ma khong lam phinh RingBooker va khong bi keo vao full complexity cua LeadMapFinder.
