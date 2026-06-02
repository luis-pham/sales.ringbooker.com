# 14 — Reuse from LeadMapFinder
> Source codebase: `/Users/huypq/Documents/Projects/Others/leadmapfinder.com`
> Hướng dẫn copy có chọn lọc — từng file, cần sửa gì, không copy gì

---

## Nguyên tắc

```
✅ Copy: providers, platform detector, booking extractors, job queue patterns
❌ Không copy: scoring engine, auth, DB schema, integrations, billing, UI
⚠️  Tham khảo: pipeline orchestration patterns (không copy nguyên)
```

LeadMapFinder dùng **Drizzle ORM + Postgres**.
sales.ringbooker.com dùng **Supabase client**.

→ Tất cả DB calls phải được viết lại.
→ Chỉ copy **business logic**, không copy **data access layer**.

---

## Module 1 — Serper Provider ⭐ Copy gần nguyên

### Source files

```
src/lib/lead-intelligence/providers/serper-provider.ts    ← MAIN
src/lib/lead-intelligence/providers/index.ts              ← provider exports
src/lib/lead-intelligence/types.ts                        ← shared types (một phần)
```

### Cần copy gì

```typescript
// Từ serper-provider.ts, lấy:
- searchBusinesses(query, options) function
- SerperResult type / interface
- normalizeSerperResult() helper
- Cost estimate constant (~$0.001/query)
- Pagination logic (page size 20, max 100)
- geo bias param (ll=@lat,lng,14z)
- Rate limiting / retry logic
```

### Cần bỏ / sửa

```typescript
// BỎ:
- Drizzle DB inserts (upsertBusinesses, etc.)
- workspace/userId scoping
- Usage ledger logging
- campaign/run coupling
- Provider abstraction layer (getSearchProvider factory)
  → sales tool chỉ cần Serper, không cần abstraction

// SỬA:
- Import paths → update to @/lib/... structure
- Return type → return NormalizedLead[] thay vì insert vào DB
- Remove BusinessSearchResult wrapper → return raw array
```

### Target file

```
sales.ringbooker.com/src/lib/providers/serper.ts
```

### Estimated effort: LOW (2-3 giờ)

---

## Module 2 — Google Places Provider ⭐ Copy một phần

### Source files

```
src/lib/lead-intelligence/providers/google-places-provider.ts
```

### Cần copy gì

```typescript
// Lấy:
- getPlaceDetails(placeId) function
  → Fetch phone, website, hours từ Places API
- parseOpeningHours() helper
  → Convert Google hours format → is_open_sunday, closes_before_6pm
- Field mask constant (chỉ lấy fields cần thiết)
- Error handling / timeout logic
```

### Cần bỏ / sửa

```typescript
// BỎ:
- searchPlaces() function (dùng Serper cho search, Places chỉ để lấy details)
- Drizzle DB updates
- Workspace scoping
- Pagination logic (không cần cho details)
- Cost tracking / usage ledger

// SỬA:
- Return type → PlaceDetails object đơn giản
- Import paths
- Remove provider abstraction coupling
```

### Target file

```
sales.ringbooker.com/src/lib/providers/google-places.ts
```

### Estimated effort: LOW (1-2 giờ)

---

## Module 3 — Platform Detector ⭐⭐ Copy gần nguyên

### Source files

```
src/lib/lead-intelligence/platform-detection/detect-platforms.ts   ← MAIN
src/lib/lead-intelligence/platform-detection/platform-registry.ts  ← Platform list
src/lib/lead-intelligence/platform-detection/platform-detection.test.ts ← Tests (hữu ích)
```

### Cần copy gì

```typescript
// Từ detect-platforms.ts, lấy:
- detectPlatforms(html, links, scriptSrcs) function
- PlatformHit type { platform, confidence, evidence, tier }
- URL pattern matching logic
- Script source matching logic
- HTML body mention fallback
- Confidence scoring logic

// Từ platform-registry.ts, lấy (CHỈ các platforms cần):
```

**Platforms cần giữ (trim từ ~30+ xuống còn 10):**

```typescript
// TIER A — Full sync available với RingBooker
square:      urlPatterns: ['square.site', 'squareup.com/appointments', 'book.squareup.com']
vagaro:      urlPatterns: ['vagaro.com']
mindbody:    urlPatterns: ['mindbodyonline.com', 'widgets.mindbodyonline.com']
acuity:      urlPatterns: ['acuityscheduling.com']

// TIER B — Link-only
glossgenius: urlPatterns: ['glossgenius.com']
booksy:      urlPatterns: ['booksy.com']
fresha:      urlPatterns: ['fresha.com']
boulevard:   urlPatterns: ['boulevard.app', 'joinblvd.com']
styleseat:   urlPatterns: ['styleseat.com']
schedulicity: urlPatterns: ['schedulicity.com']

// BỎ hết: Wix, WordPress, Calendly, Squarespace, Shopify,
//         Jotform, Typeform, HubSpot, Intercom, Zendesk, etc.
//         → Không liên quan đến hair salon booking
```

### Cần bỏ / sửa

```typescript
// BỎ:
- DB writes (business_tech_stack table)
- Workspace/run scoping
- CMS detection (Wix, WordPress, etc.)
- Analytics platform detection (GA, GTM, etc.)
- Chat widget detection (Intercom, Zendesk, etc.)
- Form builder detection (Typeform, etc.)
- Call tracking detection

// SỬA:
- Import paths
- Return type → PlatformHit[] (trim fields)
- Remove ~20+ non-booking platforms from registry
```

### Target files

```
sales.ringbooker.com/src/lib/enrichment/platform-detector.ts
```

### Copy test file too!

```
Platform detection test là valuable — copy và adapt:
source: platform-detection.test.ts
target: src/lib/enrichment/__tests__/platform-detector.test.ts

Cập nhật test cases để chỉ test 10 platforms giữ lại.
```

### Estimated effort: LOW-MEDIUM (2-3 giờ)

---

## Module 4 — Booking URL Extractor ⭐ Copy gần nguyên

### Source files

```
src/lib/lead-intelligence/website-signals/extractors/booking-extractor.ts
src/lib/lead-intelligence/website-signals/extractors/cta-extractor.ts
```

### Cần copy gì

```typescript
// Từ booking-extractor.ts:
- extractBookingUrls(html, links) function
- BOOKING_DOMAINS constant (trim xuống còn platforms cần)
- Booking URL validation logic

// Từ cta-extractor.ts:
- extractCtaStrength(html) function
- STRONG_CTA_KEYWORDS
- WEAK_CTA_KEYWORDS
- ctaStrength: 'strong' | 'weak' | 'none' type
```

### Cần bỏ / sửa

```typescript
// BỎ:
- DB writes
- Quote/appointment form detection (chỉ cần booking)
- Phone number extraction (sẽ handle riêng)

// SỬA:
- Trim BOOKING_DOMAINS chỉ còn 10 platforms
- Import paths
```

### Target file

```
sales.ringbooker.com/src/lib/enrichment/website-crawler.ts
(tích hợp vào crawler, không tách file riêng)
```

### Estimated effort: LOW (1 giờ)

---

## Module 5 — Phone/Email Extractors ⭐ Copy regex patterns

### Source files

```
src/lib/lead-intelligence/website-signals/extractors/contact-extractor.ts
src/lib/lead-intelligence/website-signals/extractors/phone-extractor.ts
```

### Chỉ cần lấy

```typescript
// Phone extraction regex:
const PHONE_REGEX = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g

// Phone normalization:
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return null
}

// Email extraction regex:
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
```

### Không cần copy cả file

Chỉ copy 3 regex patterns và normalize functions trên.
Tích hợp trực tiếp vào `website-crawler.ts`.

### Estimated effort: TRIVIAL (30 phút)

---

## Module 6 — Instagram Link Detector ⭐ Copy pattern

### Source files

```
src/lib/lead-intelligence/website-signals/extractors/social-extractor.ts
```

### Chỉ cần lấy

```typescript
// Instagram URL extraction từ website HTML:
function extractInstagramLinks(links: string[]): string[] {
  return links
    .filter(l => l.includes('instagram.com/'))
    .map(l => {
      // Normalize: remove query params, trailing slashes
      const clean = l.split('?')[0].replace(/\/$/, '')
      return clean
    })
    .filter((l, i, arr) => arr.indexOf(l) === i)  // dedupe
    .slice(0, 3)
}

// Extract handle from Instagram URL:
function extractInstagramHandle(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\//, '').replace(/\/$/, '')
    const handle = path.split('/')[0]
    if (/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return handle
    return null
  } catch { return null }
}
```

### Không cần copy cả file

Chỉ copy 2 functions trên.
Tích hợp vào `website-crawler.ts`.

### Estimated effort: TRIVIAL (30 phút)

---

## Module 7 — Pipeline Queue Patterns ⚠️ Tham khảo, không copy

### Source files

```
src/lib/lead-intelligence/pipeline/jobs/pipeline-queue.ts
scripts/worker.ts
```

### Tại sao không copy

```
LeadMapFinder dùng Drizzle để query pipeline_jobs table.
sales.ringbooker.com dùng Supabase client + RPC functions.
→ Data access layer hoàn toàn khác → rewrite từ đầu.
```

### Tham khảo patterns

```typescript
// Học từ LeadMapFinder:
1. Optimistic locking với SKIP LOCKED (PostgreSQL)
   → Đã implement trong file 11_WORKER_JOBS.md

2. Exponential backoff:
   const backoffMs = Math.min(30_000 * Math.pow(4, attempts - 1), 600_000)
   → Copy pattern này

3. Stale job release:
   WHERE status = 'processing' AND locked_at < now() - interval
   → Copy pattern này

4. Job result logging:
   await completeJob(id, { durationMs, metadata })
   → Copy pattern này

5. Worker graceful shutdown (SIGTERM):
   → Copy pattern từ scripts/worker.ts
```

### Target file

```
sales.ringbooker.com/src/lib/jobs/queue.ts
(đã được viết trong 03_SEARCH_PIPELINE.md dựa trên patterns này)
```

### Estimated effort: N/A (đã implement trong file 03)

---

## Module 8 — Hours Parser ⭐ Copy helper

### Source files

```
src/lib/lead-intelligence/website-signals/extractors/hours-extractor.ts
src/lib/lead-intelligence/providers/google-places-provider.ts
(hours parsing section)
```

### Cần copy

```typescript
// Google Places hours format → useful fields:
function parseGoogleHours(hoursRaw: any): {
  isOpenSunday: boolean | null
  closesBefore6PM: boolean | null
  formattedHours: string | null
} {
  const periods = hoursRaw?.periods ?? []
  if (!periods.length) return { isOpenSunday: null, closesBefore6PM: null, formattedHours: null }

  // Sunday = day 0
  const isOpenSunday = periods.some((p: any) => p.open?.day === 0)

  // Check if all weekday closes are before 18:00
  const weekdays = periods.filter((p: any) => p.open?.day >= 1 && p.open?.day <= 5)
  const closesBefore6PM = weekdays.length > 0
    ? weekdays.every((p: any) => (p.close?.hour ?? 24) < 18)
    : null

  return { isOpenSunday, closesBefore6PM, formattedHours: null }
}
```

### Target

Tích hợp vào `src/lib/providers/google-places.ts`.

### Estimated effort: TRIVIAL (30 phút)

---

## Module 9 — Scoring Engine ❌ KHÔNG copy — Build fresh

### Tại sao không copy

```
LeadMapFinder scoring engine (~500 LOC):
- 10 sub-scores (contactability, phoneDependency, etc.)
- Multiple offer types (website_redesign, local_seo, etc.)
- Contact gate logic
- Opportunity profile service
- Franchise detection

sales.ringbooker.com chỉ cần:
- 8 factors đơn giản (đã define trong 06_SCORING_ENGINE.md)
- 1 offer type (ai_receptionist)
- No contact gate

→ Copy sẽ kéo theo quá nhiều complexity không cần thiết
→ Build fresh từ 06_SCORING_ENGINE.md nhanh hơn và cleaner
```

### Tham khảo

```typescript
// Học từ scoring-engine.ts:
// Pattern: explainable reasons alongside scores

// LeadMapFinder làm:
const reasons = []
if (bookingFrictionScore > 60) {
  reasons.push({ type: 'no_booking', weight: 'high', evidence: '...' })
}

// Áp dụng cho sales tool:
const factors: ScoringFactors = {
  noOnlineBooking: 25,  // đã explain tại sao
  businessAge: 15,
  // ...
}
// factors là "reasons" — đủ explainable cho UI
```

---

## Module 10 — Chain Detection ⭐ Copy pattern

### Source files

```
src/lib/lead-intelligence/franchise-detection/franchise-detection-service.ts
```

### Chỉ cần lấy patterns list

```typescript
// Chain/franchise patterns để filter ra:
const CHAIN_PATTERNS = [
  /great clips/i,
  /supercuts/i,
  /sport clips/i,
  /fantastic sams/i,
  /cost cutters/i,
  /regis salon/i,
  /hair cuttery/i,
  /floyd's/i,
  /great clips/i,
  /roosters/i,
  /the barber shop/i,  // common chain name
]

// Thêm từ LeadMapFinder franchise list vào đây
// LeadMapFinder có list dài hơn — copy toàn bộ patterns
```

### Target

Tích hợp vào `src/lib/jobs/handlers/search.ts` — filter trong search handler.

### Estimated effort: TRIVIAL (30 phút)

---

## Không copy — và tại sao

| Module | Lý do không copy |
|--------|-----------------|
| Auth (NextAuth + bcrypt) | sales tool dùng Supabase Auth + Google OAuth, hoàn toàn khác |
| DB schema (59 tables, Drizzle) | sales tool dùng Supabase + 11 tables riêng |
| Pipeline orchestrator (2000 LOC) | Quá phức tạp, kéo theo campaign/workspace/quota logic |
| SEO Audit module | Không cần cho hair salon outreach |
| Review Pain Detection | Cần Apify/SerpAPI riêng, phức tạp không cần thiết |
| Conversion Gap | Không liên quan |
| Competitor Context | Không cần |
| Decision Maker Discovery | Không cần (DM qua Instagram là đủ) |
| Email Verification | Không cần (không send emails) |
| GHL/Instantly/Smartlead/Zapier integrations | Không cần |
| Billing/Plan limits | Không cần (internal tool) |
| Advanced enrichment | Không cần (WHOIS, SSL, Yelp) |
| Workspace/team multi-tenant | sales tool chỉ 2-3 users, dùng Supabase Auth roles |
| UI components (Spotdar shell) | Design system khác, rebuild từ shadcn/ui |
| AI asset generation | Không cần trong phase 1 |

---

## Copy Checklist

Thực hiện theo thứ tự:

```
□ Step 1: Copy serper-provider.ts
  → Mở file source tại leadmapfinder.com/src/lib/lead-intelligence/providers/serper-provider.ts
  → Copy searchBusinesses() + normalizeSerperResult() + types
  → Remove DB writes, workspace scoping, usage ledger
  → Update imports
  → Save to sales-ringbooker/src/lib/providers/serper.ts
  → Test: run quick search, verify return structure

□ Step 2: Copy google-places-provider.ts (details only)
  → Lấy getPlaceDetails() + parseOpeningHours()
  → Save to sales-ringbooker/src/lib/providers/google-places.ts
  → Test: fetch details for a known place_id

□ Step 3: Copy platform-detector
  → Mở detect-platforms.ts + platform-registry.ts
  → Copy detectPlatforms() function
  → Copy ONLY 10 platform definitions (Square, Vagaro, Mindbody, Acuity, GlossGenius, Booksy, Fresha, Boulevard, StyleSeat, Schedulicity)
  → Save to sales-ringbooker/src/lib/enrichment/platform-detector.ts
  → Copy + adapt test file
  → Test: pass HTML with Square script → should detect

□ Step 4: Tích hợp extractors vào website-crawler.ts
  → Copy booking URL patterns từ booking-extractor.ts
  → Copy CTA keywords từ cta-extractor.ts
  → Copy phone/email regex từ contact-extractor.ts
  → Copy Instagram link extraction từ social-extractor.ts
  → Build website-crawler.ts sử dụng tất cả patterns trên

□ Step 5: Copy hours parser
  → Copy parseGoogleHours() từ google-places-provider.ts
  → Tích hợp vào providers/google-places.ts

□ Step 6: Copy chain patterns
  → Mở franchise-detection-service.ts
  → Copy toàn bộ chain/franchise name patterns
  → Tích hợp vào jobs/handlers/search.ts isChainSalon()
```

---

## Estimated Total Reuse Effort

```
Module 1: Serper provider          → 2-3 giờ
Module 2: Google Places            → 1-2 giờ
Module 3: Platform detector        → 2-3 giờ
Module 4: Booking URL extractor    → 1 giờ
Module 5: Phone/email regex        → 0.5 giờ
Module 6: Instagram link detector  → 0.5 giờ
Module 7: Queue patterns           → N/A (đã có trong file 03)
Module 8: Hours parser             → 0.5 giờ
Module 10: Chain detection         → 0.5 giờ
─────────────────────────────────────────────
Total reuse work:                  → ~8-10 giờ

vs. Build from scratch:            → ~20-25 giờ
Saved:                             → ~12-15 giờ (~50% faster)
```

---

## Quan trọng: Verify trước khi copy

Trước khi copy mỗi module, AI coding assistant cần:

```bash
# 1. Verify file tồn tại
ls /Users/huypq/Documents/Projects/Others/leadmapfinder.com/src/lib/lead-intelligence/providers/

# 2. Read file đầy đủ trước khi copy
cat /Users/huypq/Documents/Projects/Others/leadmapfinder.com/src/lib/lead-intelligence/providers/serper-provider.ts

# 3. Identify tất cả imports cần giữ vs bỏ
grep "^import" [file] | head -20

# 4. Copy và strip theo hướng dẫn từng module ở trên
```

**Không copy blindly** — mỗi file cần được đọc kỹ và strip DB/workspace logic trước khi paste vào project mới.
