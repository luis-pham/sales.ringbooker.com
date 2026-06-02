```
## Task: Implement exhaustive, deduplicated, automated search pipeline
## Codebase: sales.ringbooker.com
## Goal: Worker tự động chạy 24/7, geo-grid search toàn thành phố,
##       không bỏ sót, không lãng phí Serper credits, không import trùng

---

### PHASE 1 — Audit codebase hiện tại trước khi sửa bất cứ thứ gì

---

#### Step 1 — Đọc tất cả files liên quan

```bash
# Worker script
cat scripts/worker.ts

# Job queue
cat src/lib/jobs/queue.ts

# Search handler hiện tại
cat src/lib/jobs/handlers/search.ts

# Serper provider hiện tại
cat src/lib/providers/serper.ts

# Enrich handler (để biết payload format)
cat src/lib/jobs/handlers/enrich.ts

# Schema migrations liên quan
cat supabase/migrations/003_search_runs.sql
cat supabase/migrations/004_salon_leads.sql
cat supabase/migrations/011_jobs.sql

# Config files nếu có
find src/lib/config -type f 2>/dev/null | xargs ls -la 2>/dev/null || echo "No config dir"

# Search targets nếu đã có
find . -name "search-targets*" -not -path "*/node_modules/*" 2>/dev/null
```

Report đầy đủ:

1. **Worker switch cases** — liệt kê tất cả job types hiện có
2. **Serper provider** — params hiện tại, có `ll` (coordinates) param không?
   Có pagination/`page` param không? Max results là bao nhiêu?
3. **Search handler dedup** — đang check những field nào?
   `google_place_id` only hay có phone dedup không?
4. **`lead_search_runs` columns** — liệt kê đủ,
   có `vertical` column không? Có `grid_point` không?
5. **`salon_leads` indexes** — liệt kê tất cả UNIQUE indexes
6. **`jobs` type CHECK constraint** — liệt kê tất cả allowed types
7. **Có `auto_search_queue` hay city list nào chưa?**
8. **Số migration cuối cùng** — để biết migration mới đánh số mấy

---

#### Step 2 — Test Serper API response format

Viết và chạy script test nhanh (KHÔNG lưu vào DB):

```typescript
// scripts/test-serper.ts
import 'dotenv/config'

async function testSerper() {
  // Test 1: Basic search không có coordinates
  const res1 = await fetch('https://google.serper.dev/maps', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: 'hair salons Houston TX',
      gl: 'us',
      hl: 'en',
      num: 20,
    }),
  })
  const data1 = await res1.json()
  console.log('=== Test 1: Basic search ===')
  console.log('Total places:', data1.places?.length)
  console.log('First place fields:', Object.keys(data1.places?.[0] ?? {}))
  console.log('Has placeId:', !!data1.places?.[0]?.placeId)
  console.log('Has cid:', !!data1.places?.[0]?.cid)
  console.log('Has phone:', !!data1.places?.[0]?.phoneNumber)
  console.log('Has coordinates:', !!data1.places?.[0]?.latitude)

  // Test 2: Search với geo coordinates
  const res2 = await fetch('https://google.serper.dev/maps', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: 'hair salons',
      gl: 'us',
      hl: 'en',
      num: 20,
      ll: '@29.7604,-95.3698,13z',  // Houston center
    }),
  })
  const data2 = await res2.json()
  console.log('\n=== Test 2: With coordinates ===')
  console.log('Total places:', data2.places?.length)
  console.log('Different from test 1?',
    data2.places?.[0]?.placeId !== data1.places?.[0]?.placeId)

  // Test 3: Page 2
  const res3 = await fetch('https://google.serper.dev/maps', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: 'hair salons Houston TX',
      gl: 'us',
      hl: 'en',
      num: 20,
      page: 2,
    }),
  })
  const data3 = await res3.json()
  console.log('\n=== Test 3: Page 2 ===')
  console.log('Total places:', data3.places?.length)
  console.log('Has results:', (data3.places?.length ?? 0) > 0)

  // Print raw field names from first result
  console.log('\n=== All fields in place result ===')
  console.log(JSON.stringify(data1.places?.[0], null, 2))
}

testSerper().catch(console.error)
```

```bash
npx tsx scripts/test-serper.ts
```

Report:
1. Field name cho place ID — là `placeId`, `place_id`, hay `cid`?
2. Field name cho phone — `phoneNumber`, `phone`, hay khác?
3. Field name cho coordinates — `latitude`/`longitude` hay khác?
4. Page 2 có trả về results không?
5. Coordinates param (`ll`) có làm thay đổi results không?
6. Tất cả field names trong response object

---

### PHASE 2 — Design (confirm trước khi implement)

Dựa trên audit, trả lời và confirm với user:

**A. Migrations cần tạo**

```
Migration [N+1]: Nâng cấp search infrastructure
- Thêm columns vào lead_search_runs:
  vertical TEXT
  grid_point TEXT (format: "lat,lng,zoom")
  query_variation TEXT
  grid_index INTEGER (vị trí trong grid, e.g. 0,1,2...)
- Thêm index: (city, state, vertical, status, created_at)

Migration [N+2]: Nâng cấp dedup trên salon_leads
- UNIQUE INDEX on google_place_id WHERE NOT NULL
- UNIQUE INDEX on (phone, city) WHERE phone IS NOT NULL
  AND city IS NOT NULL
- Nếu có conflict → dùng ON CONFLICT DO NOTHING

Migration [N+3]: Thêm job type auto_search_queue
- Update CHECK constraint trên jobs.type
```

**B. Files mới cần tạo**

```
src/lib/config/search-targets.ts
  → City list, grid configs, vertical queries

src/lib/providers/serper-grid.ts
  → Geo-grid search logic
  → Pagination per grid point
  → Merge + dedup across grid points

src/lib/jobs/handlers/auto-search-queue.ts
  → shouldSearch() logic
  → Auto-enqueue search jobs per target
  → Stagger scheduling
```

**C. Files cần sửa**

```
src/lib/providers/serper.ts
  → Thêm ll (coordinates) param support
  → Thêm page pagination support
  → Normalize field names dựa trên test result

src/lib/jobs/handlers/search.ts
  → Nâng cấp dedup: place_id + phone + name/address
  → ON CONFLICT DO NOTHING thay vì check-then-insert
  → Pass vertical vào search run record
  → Pass grid_point vào search run record

scripts/worker.ts
  → Thêm case 'auto_search_queue'
  → Thêm daily auto-queue trigger
```

**Confirm approach với user trước khi code.**

---

### PHASE 3 — Implement theo thứ tự

Chỉ implement sau khi Phase 2 được confirm.
Implement từng bước, verify xong mới sang bước tiếp.

---

#### Step A — Migrations

Tạo migration files theo số tiếp theo từ audit.

**Migration [N+1] — search_runs nâng cấp:**

```sql
-- Thêm columns tracking grid search
ALTER TABLE lead_search_runs
  ADD COLUMN IF NOT EXISTS vertical TEXT,
  ADD COLUMN IF NOT EXISTS grid_point TEXT,
  ADD COLUMN IF NOT EXISTS query_variation TEXT,
  ADD COLUMN IF NOT EXISTS grid_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grid_total INTEGER DEFAULT 1;

-- Index để lookup nhanh
-- "City X, vertical Y đã search gần đây chưa?"
CREATE INDEX IF NOT EXISTS search_runs_city_vertical_idx
  ON lead_search_runs(city, state, vertical, status, created_at DESC)
  WHERE status = 'completed';

-- Index để check pending jobs
CREATE INDEX IF NOT EXISTS search_runs_pending_idx
  ON lead_search_runs(city, state, vertical, status)
  WHERE status IN ('pending', 'running');
```

**Migration [N+2] — salon_leads dedup:**

```sql
-- DB-level unique constraint thay vì chỉ check ở code
-- ON CONFLICT DO NOTHING sẽ dùng index này
CREATE UNIQUE INDEX IF NOT EXISTS salon_leads_place_id_unique
  ON salon_leads(google_place_id)
  WHERE google_place_id IS NOT NULL;

-- Fallback dedup: phone + city
CREATE UNIQUE INDEX IF NOT EXISTS salon_leads_phone_city_unique
  ON salon_leads(phone, city)
  WHERE phone IS NOT NULL
    AND city IS NOT NULL
    AND length(phone) >= 10;
```

**Migration [N+3] — jobs type:**

```sql
-- Check constraint hiện tại
-- (thay bằng tên constraint thật từ audit)
DO $$
BEGIN
  -- Drop old constraint
  ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;

  -- Add new constraint với auto_search_queue
  ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
    CHECK (type IN (
      'search_run',
      'enrich_lead',
      'enrich_instagram',
      'score_lead',
      'score_batch',
      'auto_create_demo',
      'auto_search_queue',
      'cleanup'
    ));
END $$;
```

**Sau khi viết migrations, chạy trong Supabase SQL Editor và verify:**

```sql
-- Verify columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'lead_search_runs'
  AND column_name IN ('vertical','grid_point','query_variation');

-- Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'salon_leads'
  AND indexname LIKE '%unique%';

-- Verify jobs constraint
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'jobs_type_check';
```

---

#### Step B — Search targets config

Tạo file: `src/lib/config/search-targets.ts`

Implement đầy đủ:

```typescript
// ─── Vertical → query string ──────────────────────────────────────────────

export const VERTICAL_QUERIES: Record<string, string[]> = {
  // Multiple query variations để vét thêm
  hair_salon: [
    'hair salons',
    'hair salon',
    'hair stylist',
    'hairdresser',
    'hair studio',
  ],
  nail_salon: [
    'nail salons',
    'nail salon',
    'nail spa',
    'nail studio',
  ],
  day_spa: ['day spas', 'day spa', 'spa salon'],
  lash_studio: ['lash studio', 'lash extension', 'eyelash salon'],
  waxing_studio: ['waxing salon', 'waxing studio', 'body wax'],
  barbershop: ['barbershop', 'barber shop', 'barber'],
  tattoo_studio: ['tattoo studio', 'tattoo shop', 'tattoo parlor'],
  pet_grooming: ['pet grooming', 'dog grooming', 'pet salon'],
  hvac: ['HVAC contractor', 'air conditioning repair', 'heating cooling'],
  plumber: ['plumber', 'plumbing service'],
  electrician: ['electrician', 'electrical contractor'],
}

// Phase 1: chỉ dùng query đầu tiên (primary)
// Phase 2: enable all variations
export const USE_QUERY_VARIATIONS = false

// ─── City grid configs ────────────────────────────────────────────────────

export type GridConfig = {
  center: [number, number]   // [lat, lng]
  gridSize: 1 | 2 | 3        // 1=single point, 2=2x2=4pts, 3=3x3=9pts
  zoom: string                // Serper ll zoom param
  stepDeg: number             // degrees between grid points
}

// gridSize 1 = 1 call/query
// gridSize 2 = 4 calls/query
// gridSize 3 = 9 calls/query

export const CITY_GRIDS: Record<string, GridConfig> = {
  // ── Large sprawling cities → 3x3 grid ──────────────────
  'Houston_TX': {
    center: [29.7604, -95.3698],
    gridSize: 3,
    zoom: '13z',
    stepDeg: 0.18,
  },
  'Los Angeles_CA': {
    center: [34.0522, -118.2437],
    gridSize: 3,
    zoom: '13z',
    stepDeg: 0.18,
  },
  'Dallas_TX': {
    center: [32.7767, -96.7970],
    gridSize: 3,
    zoom: '13z',
    stepDeg: 0.15,
  },
  'San Antonio_TX': {
    center: [29.4241, -98.4936],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.15,
  },

  // ── Medium cities → 2x2 grid ────────────────────────────
  'Atlanta_GA': {
    center: [33.7490, -84.3880],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.15,
  },
  'Orlando_FL': {
    center: [28.5383, -81.3792],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.12,
  },
  'Miami_FL': {
    center: [25.7617, -80.1918],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.12,
  },
  'Phoenix_AZ': {
    center: [33.4484, -112.0740],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.15,
  },
  'Charlotte_NC': {
    center: [35.2271, -80.8431],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.12,
  },
  'Jacksonville_FL': {
    center: [30.3322, -81.6557],
    gridSize: 2,
    zoom: '13z',
    stepDeg: 0.13,
  },

  // ── Smaller/denser cities → 1 point ─────────────────────
  'Las Vegas_NV': {
    center: [36.1699, -115.1398],
    gridSize: 1,
    zoom: '12z',
    stepDeg: 0,
  },
  'New Orleans_LA': {
    center: [29.9511, -90.0715],
    gridSize: 1,
    zoom: '12z',
    stepDeg: 0,
  },
}

// ─── Search targets ───────────────────────────────────────────────────────

export type SearchTarget = {
  city: string
  state: string
  vertical: keyof typeof VERTICAL_QUERIES
  priority: 1 | 2 | 3
  enabled: boolean
}

export const SEARCH_TARGETS: SearchTarget[] = [
  // ── Priority 1 — Core beauty, top cities ────────────────
  { city: 'Houston',      state: 'TX', vertical: 'hair_salon',  priority: 1, enabled: true },
  { city: 'Houston',      state: 'TX', vertical: 'nail_salon',  priority: 1, enabled: true },
  { city: 'Atlanta',      state: 'GA', vertical: 'hair_salon',  priority: 1, enabled: true },
  { city: 'Atlanta',      state: 'GA', vertical: 'nail_salon',  priority: 1, enabled: true },
  { city: 'Dallas',       state: 'TX', vertical: 'hair_salon',  priority: 1, enabled: true },
  { city: 'Dallas',       state: 'TX', vertical: 'nail_salon',  priority: 1, enabled: true },
  { city: 'Orlando',      state: 'FL', vertical: 'hair_salon',  priority: 1, enabled: true },
  { city: 'Orlando',      state: 'FL', vertical: 'nail_salon',  priority: 1, enabled: true },

  // ── Priority 2 — Secondary cities ───────────────────────
  { city: 'Los Angeles',  state: 'CA', vertical: 'hair_salon',  priority: 2, enabled: true },
  { city: 'Los Angeles',  state: 'CA', vertical: 'nail_salon',  priority: 2, enabled: true },
  { city: 'Miami',        state: 'FL', vertical: 'hair_salon',  priority: 2, enabled: true },
  { city: 'Miami',        state: 'FL', vertical: 'nail_salon',  priority: 2, enabled: true },
  { city: 'Phoenix',      state: 'AZ', vertical: 'hair_salon',  priority: 2, enabled: true },
  { city: 'Charlotte',    state: 'NC', vertical: 'hair_salon',  priority: 2, enabled: true },
  { city: 'Las Vegas',    state: 'NV', vertical: 'nail_salon',  priority: 2, enabled: true },
  { city: 'San Antonio',  state: 'TX', vertical: 'hair_salon',  priority: 2, enabled: true },
  { city: 'Jacksonville', state: 'FL', vertical: 'hair_salon',  priority: 2, enabled: true },

  // ── Priority 3 — Enable khi mở rộng vertical ────────────
  { city: 'Houston',      state: 'TX', vertical: 'day_spa',     priority: 3, enabled: false },
  { city: 'Houston',      state: 'TX', vertical: 'barbershop',  priority: 3, enabled: false },
  { city: 'Atlanta',      state: 'GA', vertical: 'day_spa',     priority: 3, enabled: false },
  { city: 'Houston',      state: 'TX', vertical: 'hvac',        priority: 3, enabled: false },
  { city: 'Dallas',       state: 'TX', vertical: 'hvac',        priority: 3, enabled: false },
  { city: 'Houston',      state: 'TX', vertical: 'pet_grooming',priority: 3, enabled: false },
]

// ─── Timing config ────────────────────────────────────────────────────────

// Không search lại cùng city+vertical trong X ngày
export const RESCRAPE_INTERVAL_DAYS = 30

// Delay giữa các search run jobs (ms)
// Tránh spam Serper, stagger theo time
export const SEARCH_JOB_STAGGER_MS = 90_000  // 90 giây

// Max results per Serper call
export const SERPER_MAX_RESULTS_PER_CALL = 100

// Max Serper pages per grid point
// Google Maps chỉ reliable đến page 5-6 (~100-120 results)
export const SERPER_MAX_PAGES = 5

// ─── Grid utilities ──────────────────────────────────────────────────────

export function getGridConfig(city: string, state: string): GridConfig {
  const key = `${city}_${state}`
  return CITY_GRIDS[key] ?? {
    // Default: single point search, city name in query
    center: [0, 0],
    gridSize: 1,
    zoom: '12z',
    stepDeg: 0,
  }
}

export function generateGridPoints(
  config: GridConfig
): { lat: number; lng: number; llParam: string }[] {
  const [centerLat, centerLng] = config.center
  const points: { lat: number; lng: number; llParam: string }[] = []

  if (config.gridSize === 1 || config.stepDeg === 0) {
    // Single point — dùng city name trong query, không cần ll param
    // (hoặc dùng center nếu muốn precise)
    return [{
      lat: centerLat,
      lng: centerLng,
      llParam: centerLat !== 0
        ? `@${centerLat},${centerLng},${config.zoom}`
        : '',
    }]
  }

  const half = Math.floor(config.gridSize / 2)

  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      const lat = parseFloat((centerLat + i * config.stepDeg).toFixed(6))
      const lng = parseFloat((centerLng + j * config.stepDeg).toFixed(6))
      points.push({
        lat,
        lng,
        llParam: `@${lat},${lng},${config.zoom}`,
      })
    }
  }

  return points
}

// Estimate Serper API calls for a search target
export function estimateSerperCalls(
  city: string,
  state: string,
  vertical: keyof typeof VERTICAL_QUERIES
): number {
  const grid = getGridConfig(city, state)
  const gridPoints = generateGridPoints(grid).length
  const queries = USE_QUERY_VARIATIONS
    ? VERTICAL_QUERIES[vertical]?.length ?? 1
    : 1
  // Each grid point × each query × max pages
  return gridPoints * queries * SERPER_MAX_PAGES
}
```

---

#### Step C — Serper provider nâng cấp

Sửa file: `src/lib/providers/serper.ts`

Implement:

```typescript
// Thêm params mới vào search function:

export type SerperSearchOptions = {
  query: string
  location?: string      // "Houston, TX" — dùng khi không có coordinates
  llParam?: string       // "@lat,lng,zoom" — geo-targeted search
  country?: string
  page?: number          // 1-based page number
  num?: number           // results per page, max 100
}

// Sửa searchGoogleMaps để:
// 1. Accept llParam param → pass vào body nếu có
// 2. Accept page param → pagination
// 3. Return nextPage indicator (có trang sau không)
// 4. Normalize field names dựa trên test result thực tế
//    (dùng kết quả từ Phase 1 Step 2)

export type SerperSearchResponse = {
  results: NormalizedLead[]
  hasMore: boolean        // có trang tiếp theo không
  totalFound: number
  page: number
  estimatedCostUsd: number
}

// Normalize: extract cả placeId VÀ cid làm fallback
// google_place_id = placeId ?? cid ?? null
```

---

#### Step D — Serper grid search

Tạo file: `src/lib/providers/serper-grid.ts`

Implement hàm chính:

```typescript
export type GridSearchOptions = {
  vertical: keyof typeof VERTICAL_QUERIES
  city: string
  state: string
  // Đã được generate từ generateGridPoints()
  gridPoint: { lat: number; lng: number; llParam: string }
  gridIndex: number
  gridTotal: number
  // Query variation
  queryVariation: string
  queryVariationIndex: number
}

export type GridSearchResult = {
  leads: NormalizedLead[]
  totalFetched: number
  totalAfterDedup: number
  pagesSearched: number
  estimatedCostUsd: number
  gridPoint: string
}

// Main function: search 1 grid point, tất cả pages
export async function searchGridPoint(
  options: GridSearchOptions
): Promise<GridSearchResult> {
  const allLeads: NormalizedLead[] = []
  let page = 1
  let hasMore = true
  let totalCost = 0

  // Pagination loop — dừng khi:
  // 1. Không còn kết quả (hasMore = false)
  // 2. Đã đến SERPER_MAX_PAGES
  // 3. Page trả về 0 results (Google hết data)
  while (hasMore && page <= SERPER_MAX_PAGES) {
    const response = await searchGoogleMaps({
      query: options.queryVariation,
      location: options.gridPoint.llParam ? undefined : `${options.city}, ${options.state}`,
      llParam: options.gridPoint.llParam || undefined,
      page,
      num: 20,  // Serper Maps thường trả 20/page
    })

    if (response.results.length === 0) break

    allLeads.push(...response.results)
    totalCost += response.estimatedCostUsd
    hasMore = response.hasMore
    page++

    // Rate limiting: delay nhỏ giữa các pages
    if (hasMore && page <= SERPER_MAX_PAGES) {
      await sleep(500)  // 500ms giữa pages
    }
  }

  // In-memory dedup cho kết quả của 1 grid point
  const deduped = deduplicateInMemory(allLeads)

  return {
    leads: deduped,
    totalFetched: allLeads.length,
    totalAfterDedup: deduped.length,
    pagesSearched: page - 1,
    estimatedCostUsd: totalCost,
    gridPoint: options.gridPoint.llParam || `${options.city},${options.state}`,
  }
}

// In-memory dedup: dùng place_id + phone
function deduplicateInMemory(leads: NormalizedLead[]): NormalizedLead[] {
  const seenPlaceIds = new Set<string>()
  const seenPhones = new Set<string>()
  const result: NormalizedLead[] = []

  for (const lead of leads) {
    // Check place_id
    if (lead.google_place_id) {
      if (seenPlaceIds.has(lead.google_place_id)) continue
      seenPlaceIds.add(lead.google_place_id)
    }

    // Check phone (fallback khi không có place_id)
    if (!lead.google_place_id && lead.phone) {
      if (seenPhones.has(lead.phone)) continue
      seenPhones.add(lead.phone)
    }

    result.push(lead)
  }

  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

#### Step E — Search handler nâng cấp

Sửa file: `src/lib/jobs/handlers/search.ts`

**Thay đổi quan trọng:**

```typescript
// Payload mới:
export type SearchRunPayload = {
  searchRunId: string
  // Optional — nếu là auto search
  vertical?: string
  gridPoint?: string          // "lat,lng,zoom"
  gridIndex?: number
  gridTotal?: number
  queryVariation?: string
  queryVariationIndex?: number
}

// Thay check-then-insert bằng INSERT ON CONFLICT DO NOTHING:
const { data: inserted, error } = await adminClient
  .from('salon_leads')
  .insert({
    ...lead,
    search_run_id: searchRunId,
    status: 'new',
    city: lead.city ?? run.city,
    state: lead.state ?? run.state,
  })
  .select('id')
  // ON CONFLICT DO NOTHING — dựa trên unique indexes từ migration
  // Supabase: .upsert() với ignoreDuplicates: true
  // Hoặc raw SQL với ON CONFLICT DO NOTHING

// Nếu không insert được (conflict) → đây là duplicate → count as duplicate
// Không phải error

// Save grid_point vào lead_search_runs
await adminClient
  .from('lead_search_runs')
  .update({
    grid_point: payload.gridPoint ?? null,
    grid_index: payload.gridIndex ?? 0,
    grid_total: payload.gridTotal ?? 1,
    query_variation: payload.queryVariation ?? null,
    vertical: payload.vertical ?? null,
  })
  .eq('id', searchRunId)
```

---

#### Step F — Auto search queue handler

Tạo file: `src/lib/jobs/handlers/auto-search-queue.ts`

Implement đầy đủ:

```typescript
export async function handleAutoSearchQueue(): Promise<{
  queued: number
  skipped: number
  totalEstimatedCalls: number
  log: string[]
}> {
  const adminClient = createAdminClient()
  const log: string[] = []
  let queued = 0
  let skipped = 0
  let totalEstimatedCalls = 0

  // Filter enabled targets, sort by priority
  const enabledTargets = SEARCH_TARGETS
    .filter(t => t.enabled)
    .sort((a, b) => a.priority - b.priority)

  for (const target of enabledTargets) {
    const targetKey = `${target.city} ${target.state} ${target.vertical}`

    // ── Check 1: đã search trong RESCRAPE_INTERVAL_DAYS chưa? ──
    const { data: lastRun } = await adminClient
      .from('lead_search_runs')
      .select('id, created_at, total_imported')
      .eq('city', target.city)
      .eq('state', target.state)
      .eq('vertical', target.vertical)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (lastRun) {
      const daysSince = (Date.now() - new Date(lastRun.created_at).getTime())
        / (1000 * 60 * 60 * 24)

      if (daysSince < RESCRAPE_INTERVAL_DAYS) {
        const daysLeft = Math.ceil(RESCRAPE_INTERVAL_DAYS - daysSince)
        log.push(`SKIP ${targetKey}: searched ${Math.floor(daysSince)}d ago, next in ${daysLeft}d`)
        skipped++
        continue
      }
    }

    // ── Check 2: có pending/running job cho target này không? ──
    const { data: pendingRun } = await adminClient
      .from('lead_search_runs')
      .select('id')
      .eq('city', target.city)
      .eq('state', target.state)
      .eq('vertical', target.vertical)
      .in('status', ['pending', 'running'])
      .limit(1)
      .single()

    if (pendingRun) {
      log.push(`SKIP ${targetKey}: already pending/running`)
      skipped++
      continue
    }

    // ── Determine queries to use ──────────────────────────────
    const queries = USE_QUERY_VARIATIONS
      ? VERTICAL_QUERIES[target.vertical] ?? [target.vertical]
      : [VERTICAL_QUERIES[target.vertical]?.[0] ?? target.vertical]

    // ── Determine grid points ─────────────────────────────────
    const gridConfig = getGridConfig(target.city, target.state)
    const gridPoints = generateGridPoints(gridConfig)

    // ── Enqueue 1 search run per grid point per query variation ──
    let queuedForTarget = 0

    for (const [queryIdx, query] of queries.entries()) {
      for (const [gridIdx, gridPoint] of gridPoints.entries()) {
        // Create search run record
        const { data: searchRun } = await adminClient
          .from('lead_search_runs')
          .insert({
            query,
            city: target.city,
            state: target.state,
            country: 'US',
            max_results: SERPER_MAX_RESULTS_PER_CALL * SERPER_MAX_PAGES,
            status: 'pending',
            vertical: target.vertical,
            grid_point: gridPoint.llParam || null,
            grid_index: gridIdx,
            grid_total: gridPoints.length,
            query_variation: query,
            created_by: null,  // system job
          })
          .select('id')
          .single()

        if (!searchRun) continue

        // Stagger: queuedForTarget * STAGGER + queued * small_delay
        const staggerMs = (queued + queuedForTarget) * SEARCH_JOB_STAGGER_MS
        const runAt = new Date(Date.now() + staggerMs)

        await enqueueJob(
          'search_run',
          {
            searchRunId: searchRun.id,
            vertical: target.vertical,
            gridPoint: gridPoint.llParam,
            gridIndex: gridIdx,
            gridTotal: gridPoints.length,
            queryVariation: query,
            queryVariationIndex: queryIdx,
          },
          {
            runAt,
            dedupeKey: `search_${target.city}_${target.state}_${target.vertical}_${query}_${gridIdx}_${new Date().toDateString()}`,
          }
        )

        queuedForTarget++
        totalEstimatedCalls += SERPER_MAX_PAGES
      }
    }

    log.push(`QUEUE ${targetKey}: ${queuedForTarget} jobs, ~${queuedForTarget * SERPER_MAX_PAGES} Serper calls`)
    queued += queuedForTarget
  }

  const summary = `AutoSearchQueue: ${queued} jobs queued, ${skipped} targets skipped, ~${totalEstimatedCalls} Serper calls estimated`
  console.log(`[AutoSearchQueue] ${summary}`)
  log.forEach(l => console.log(`[AutoSearchQueue] ${l}`))

  return { queued, skipped, totalEstimatedCalls, log }
}
```

---

#### Step G — Worker update

Sửa file: `scripts/worker.ts`

```typescript
// 1. Thêm import
import { handleAutoSearchQueue } from '../src/lib/jobs/handlers/auto-search-queue'

// 2. Thêm case trong switch
case 'auto_search_queue':
  await handleAutoSearchQueue(job.payload as any)
  break

// 3. Thêm daily auto-trigger
// Chạy lúc 2:00 AM UTC mỗi ngày
// Không cần cron library — track bằng lastRun timestamp

let lastAutoQueueRun = 0
const AUTO_QUEUE_INTERVAL_MS = 24 * 60 * 60 * 1000  // 24 giờ
const AUTO_QUEUE_HOUR_UTC = 2  // 2:00 AM UTC

// Trong main while loop, sau releaseStaleJobs():
const now = new Date()
const isAutoQueueTime =
  now.getUTCHours() === AUTO_QUEUE_HOUR_UTC &&
  now.getUTCMinutes() < 5 &&  // window 5 phút
  Date.now() - lastAutoQueueRun > AUTO_QUEUE_INTERVAL_MS

if (isAutoQueueTime) {
  console.log('[Worker] Triggering daily auto search queue...')
  await enqueueJob('auto_search_queue', {}, {
    dedupeKey: `auto_search_queue_${now.toISOString().split('T')[0]}`,
  })
  lastAutoQueueRun = Date.now()
}
```

---

#### Step H — Test end-to-end

**Test 1: Manual trigger auto search queue**

```bash
# Trong Supabase SQL Editor:
INSERT INTO jobs (type, payload, status, max_attempts)
VALUES (
  'auto_search_queue',
  '{}',
  'pending',
  1
);

# Watch Railway logs:
# Phải thấy:
# [AutoSearchQueue] QUEUE Houston TX hair_salon: N jobs queued
# [AutoSearchQueue] SKIP Atlanta GA hair_salon: searched Xd ago
```

**Test 2: Search run với grid point**

```bash
# Check jobs được tạo:
SELECT type, payload->>'city', payload->>'gridPoint',
       payload->>'vertical', next_run_at
FROM jobs
WHERE type = 'search_run'
  AND status = 'pending'
ORDER BY next_run_at
LIMIT 20;
```

**Test 3: Dedup hoạt động đúng**

```sql
-- Sau khi search run complete, check không có duplicate place_id:
SELECT google_place_id, COUNT(*) as cnt
FROM salon_leads
WHERE google_place_id IS NOT NULL
GROUP BY google_place_id
HAVING COUNT(*) > 1;
-- Phải trả về 0 rows

-- Check duplicate phone:
SELECT phone, city, COUNT(*) as cnt
FROM salon_leads
WHERE phone IS NOT NULL
GROUP BY phone, city
HAVING COUNT(*) > 1;
-- Phải trả về 0 rows
```

**Test 4: Coverage check**

```sql
-- Leads per city per vertical:
SELECT city, state,
       COUNT(*) as total_leads,
       COUNT(*) FILTER (WHERE status != 'new') as enriched,
       MIN(created_at) as first_import,
       MAX(created_at) as last_import
FROM salon_leads
GROUP BY city, state
ORDER BY total_leads DESC;

-- Search runs per city:
SELECT city, state, vertical,
       COUNT(*) as total_runs,
       SUM(total_imported) as total_imported,
       SUM(total_duplicate) as total_duplicates,
       MAX(created_at) as last_search
FROM lead_search_runs
WHERE status = 'completed'
GROUP BY city, state, vertical
ORDER BY last_search DESC;
```

---

### PHASE 4 — Verify và tối ưu

Sau khi test pass:

**1. Check Serper credit usage**

```sql
-- Estimated cost từ search runs:
SELECT
  SUM(estimated_cost_usd) as total_cost,
  COUNT(*) as total_runs,
  AVG(total_imported) as avg_leads_per_run,
  AVG(total_duplicate) as avg_duplicates_per_run
FROM lead_search_runs
WHERE status = 'completed'
  AND created_at > now() - interval '7 days';
```

**2. Đánh giá grid coverage**

```sql
-- Leads per grid point:
SELECT grid_point, COUNT(*) as leads_from_point
FROM lead_search_runs lr
JOIN salon_leads sl ON sl.search_run_id = lr.id
WHERE lr.vertical = 'hair_salon'
  AND lr.city = 'Houston'
GROUP BY grid_point
ORDER BY leads_from_point DESC;
-- Nếu 1 point trả về quá ít → grid step quá lớn
-- Nếu overlap quá nhiều → grid step quá nhỏ
```

**3. Tune nếu cần**

```
Quá ít leads per city:
→ Tăng gridSize từ 2→3
→ Bật USE_QUERY_VARIATIONS = true

Quá nhiều duplicates (>50%):
→ Giảm gridSize
→ Tăng RESCRAPE_INTERVAL_DAYS

Serper cost quá cao:
→ Giảm SERPER_MAX_PAGES từ 5→3
→ Tắt query variations
→ Dùng gridSize=1 cho secondary cities
```

---

### Constraints

- DO NOT thay đổi logic enrichment, scoring, demo
- DO NOT xóa dữ liệu hiện có trong DB
- DO NOT sửa auth/middleware
- Mỗi step verify xong trước khi sang bước tiếp
- Nếu test fail → báo cáo lỗi cụ thể, không tự ý sửa schema
- Khi sửa `scripts/worker.ts` → chạy `npm run typecheck` trước khi báo xong
```