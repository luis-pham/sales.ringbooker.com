# 03 — Search Pipeline
> Depends on: 01_DATABASE_SCHEMA.md, 02_AUTH_USER_MANAGEMENT.md
> Finds hair salons via Serper (Google Maps) and imports into DB

---

## Overview

```
Admin triggers search
    ↓
API creates lead_search_runs record
    ↓
Job queued: search_run
    ↓
Worker: calls Serper API
    ↓
Deduplicate by google_place_id
    ↓
Import to salon_leads
    ↓
Auto-queue enrich_lead jobs for each
```

---

## 1. Serper Provider

File: `src/lib/providers/serper.ts`

```typescript
import { z } from 'zod'

const SerperResultSchema = z.object({
  title: z.string(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  category: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  cid: z.string().optional(),
  placeId: z.string().optional(),
  thumbnailUrl: z.string().optional(),
})

export type SerperResult = z.infer<typeof SerperResultSchema>

export type SerperSearchOptions = {
  query: string
  location: string       // "Houston, TX"
  country?: string       // "us"
  limit?: number         // max 100
  lat?: number
  lng?: number
}

export type SerperSearchResult = {
  results: NormalizedLead[]
  totalFound: number
  estimatedCostUsd: number
  rawResults: SerperResult[]
}

export type NormalizedLead = {
  name: string
  phone: string | null
  website_url: string | null
  address: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  google_place_id: string | null
  google_maps_url: string | null
  rating: number | null
  review_count: number | null
  categories: string[]
  hours_raw: Record<string, unknown> | null
}

export async function searchGoogleMaps(
  options: SerperSearchOptions
): Promise<SerperSearchResult> {
  const { query, location, country = 'us', limit = 50, lat, lng } = options

  const body: Record<string, unknown> = {
    q: `${query} ${location}`,
    gl: country,
    hl: 'en',
    num: Math.min(limit, 100),
  }

  // Add geo bias if coordinates provided
  if (lat && lng) {
    body.ll = `@${lat},${lng},14z`
  }

  const response = await fetch('https://google.serper.dev/maps', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const rawResults: SerperResult[] = data.places ?? []

  // Normalize results
  const results = rawResults
    .map(normalizeSerperResult)
    .filter((r): r is NormalizedLead => r !== null)

  // Dedupe within results
  const seen = new Set<string>()
  const dedupedResults = results.filter(r => {
    const key = r.google_place_id ?? `${r.name}-${r.address}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    results: dedupedResults,
    totalFound: dedupedResults.length,
    estimatedCostUsd: 0.001,  // ~$0.001 per query
    rawResults,
  }
}

function normalizeSerperResult(raw: SerperResult): NormalizedLead | null {
  if (!raw.title?.trim()) return null

  // Parse city/state from address
  const { city, state } = parseAddress(raw.address ?? '')

  // Build Google Maps URL
  const mapsUrl = raw.cid
    ? `https://www.google.com/maps?cid=${raw.cid}`
    : raw.placeId
    ? `https://www.google.com/maps/place/?q=place_id:${raw.placeId}`
    : null

  return {
    name: raw.title.trim(),
    phone: normalizePhone(raw.phone ?? null),
    website_url: normalizeUrl(raw.website ?? null),
    address: raw.address ?? null,
    city: city || null,
    state: state || null,
    lat: raw.latitude ?? null,
    lng: raw.longitude ?? null,
    google_place_id: raw.placeId ?? raw.cid ?? null,
    google_maps_url: mapsUrl,
    rating: raw.rating ?? null,
    review_count: raw.ratingCount ?? null,
    categories: raw.category ? [raw.category] : [],
    hours_raw: null,  // Serper doesn't return hours
  }
}

function parseAddress(address: string): { city: string; state: string } {
  // "1234 Main St, Houston, TX 77001, USA"
  const parts = address.split(',').map(p => p.trim())
  const stateZipPart = parts.find(p => /^[A-Z]{2}\s+\d{5}/.test(p))

  if (stateZipPart) {
    const [state] = stateZipPart.split(' ')
    const cityIndex = parts.indexOf(stateZipPart) - 1
    return {
      city: cityIndex >= 0 ? parts[cityIndex] : '',
      state: state ?? '',
    }
  }

  // Fallback: last non-country part
  const filtered = parts.filter(p => p !== 'USA' && p !== 'United States')
  return {
    city: filtered[filtered.length - 2] ?? '',
    state: filtered[filtered.length - 1]?.slice(0, 2) ?? '',
  }
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return phone
}

function normalizeUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.origin + parsed.pathname.replace(/\/$/, '')
  } catch {
    return null
  }
}
```

---

## 2. Google Places Provider (for details)

File: `src/lib/providers/google-places.ts`

```typescript
export type PlaceDetails = {
  phone: string | null
  website_url: string | null
  hours_raw: Record<string, unknown> | null
  is_open_sunday: boolean | null
  closes_before_6pm: boolean | null
  rating: number | null
  review_count: number | null
  instagram_url: string | null
}

export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  const fields = [
    'id', 'displayName', 'nationalPhoneNumber',
    'websiteUri', 'currentOpeningHours', 'regularOpeningHours',
    'rating', 'userRatingCount'
  ].join(',')

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': fields,
      },
      signal: AbortSignal.timeout(10000),
    }
  )

  if (!response.ok) return null

  const data = await response.json()
  const hours = data.regularOpeningHours ?? data.currentOpeningHours

  return {
    phone: data.nationalPhoneNumber ?? null,
    website_url: data.websiteUri ?? null,
    hours_raw: hours ?? null,
    is_open_sunday: detectOpenSunday(hours),
    closes_before_6pm: detectClosesBefore6PM(hours),
    rating: data.rating ?? null,
    review_count: data.userRatingCount ?? null,
    instagram_url: null,
  }
}

function detectOpenSunday(hours: any): boolean | null {
  if (!hours?.periods) return null
  return hours.periods.some((p: any) => p.open?.day === 0)  // 0 = Sunday
}

function detectClosesBefore6PM(hours: any): boolean | null {
  if (!hours?.periods) return null

  const weekdayPeriods = hours.periods.filter(
    (p: any) => p.open?.day >= 1 && p.open?.day <= 5
  )
  if (weekdayPeriods.length === 0) return null

  // Check if all weekday close times are before 18:00
  return weekdayPeriods.every((p: any) => {
    const closeTime = p.close?.hour ?? 24
    return closeTime < 18
  })
}
```

---

## 3. Job Handler: Search Run

File: `src/lib/jobs/handlers/search.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { searchGoogleMaps } from '@/lib/providers/serper'
import { enqueueJob } from '@/lib/jobs/queue'

export type SearchRunPayload = {
  searchRunId: string
}

// Chain filter patterns for known salon chains
const CHAIN_PATTERNS = [
  /great clips/i, /supercuts/i, /sport clips/i,
  /fantastic sams/i, /cost cutters/i, /regis salon/i,
  /hair cuttery/i, /flowery/i, /ulta/i, /aveda/i,
]

function isChainSalon(name: string): boolean {
  return CHAIN_PATTERNS.some(p => p.test(name))
}

export async function handleSearchRun(payload: SearchRunPayload): Promise<void> {
  const { searchRunId } = payload
  const adminClient = createAdminClient()

  // Load search run config
  const { data: run, error: runError } = await adminClient
    .from('lead_search_runs')
    .select('*')
    .eq('id', searchRunId)
    .single()

  if (runError || !run) {
    throw new Error(`Search run not found: ${searchRunId}`)
  }

  // Mark as running
  await adminClient
    .from('lead_search_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', searchRunId)

  try {
    // Execute search
    const searchResult = await searchGoogleMaps({
      query: run.query,
      location: `${run.city}, ${run.state}`,
      country: run.country,
      limit: run.max_results,
    })

    let imported = 0
    let skipped = 0
    let duplicates = 0

    // Process each result
    for (const lead of searchResult.results) {
      // Filter: must have phone OR website to be useful
      if (!lead.phone && !lead.website_url) {
        skipped++
        continue
      }

      // Filter: skip obvious chains
      if (isChainSalon(lead.name)) {
        skipped++
        continue
      }

      // Filter: must have google_place_id for dedup
      if (!lead.google_place_id) {
        skipped++
        continue
      }

      // Check duplicate
      const { data: existing } = await adminClient
        .from('salon_leads')
        .select('id')
        .eq('google_place_id', lead.google_place_id)
        .single()

      if (existing) {
        duplicates++
        continue
      }

      // Insert lead
      const { data: newLead, error: insertError } = await adminClient
        .from('salon_leads')
        .insert({
          ...lead,
          search_run_id: searchRunId,
          status: 'new',
          city: lead.city ?? run.city,
          state: lead.state ?? run.state,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Failed to insert lead:', insertError.message)
        skipped++
        continue
      }

      // Save raw source snapshot
      await adminClient
        .from('lead_source_snapshots')
        .insert({
          lead_id: newLead.id,
          provider: run.provider,
          provider_id: lead.google_place_id,
          raw: searchResult.rawResults.find(
            r => r.placeId === lead.google_place_id || r.cid === lead.google_place_id
          ) ?? {},
        })

      // Queue enrichment
      await enqueueJob('enrich_lead', { leadId: newLead.id })

      imported++
    }

    // Update search run with results
    await adminClient
      .from('lead_search_runs')
      .update({
        status: 'completed',
        total_found: searchResult.totalFound,
        total_imported: imported,
        total_skipped: skipped,
        total_duplicate: duplicates,
        estimated_cost_usd: searchResult.estimatedCostUsd,
        completed_at: new Date().toISOString(),
      })
      .eq('id', searchRunId)

  } catch (error) {
    await adminClient
      .from('lead_search_runs')
      .update({
        status: 'failed',
        error: String(error),
        completed_at: new Date().toISOString(),
      })
      .eq('id', searchRunId)

    throw error
  }
}
```

---

## 4. Search API Route

File: `src/app/api/search/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().default('hair salons'),
  city: z.string().min(2).max(100).trim(),
  state: z.string().length(2).toUpperCase(),
  country: z.string().default('US'),
  max_results: z.number().int().min(10).max(200).default(50),
})

export async function POST(request: NextRequest) {
  const { user, profile } = await getSessionUser()

  if (!user || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = searchSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  // Create search run
  const { data: searchRun, error } = await adminClient
    .from('lead_search_runs')
    .insert({
      ...parsed.data,
      created_by: user.id,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Queue the job
  const jobId = await enqueueJob('search_run', {
    searchRunId: searchRun.id,
  })

  return NextResponse.json({
    data: {
      searchRunId: searchRun.id,
      jobId,
      status: 'queued',
    }
  })
}

export async function GET(request: NextRequest) {
  const { profile } = await getSessionUser()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 20

  const { data: runs, count } = await adminClient
    .from('lead_search_runs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  return NextResponse.json({
    data: runs,
    total: count ?? 0,
    page,
    hasMore: ((count ?? 0) > page * limit),
  })
}
```

---

## 5. Search UI Pages

### `src/app/(dashboard)/search/page.tsx`

```tsx
import { requireRole } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { SearchPageClient } from './SearchPageClient'

export default async function SearchPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { data: recentRuns } = await supabase
    .from('lead_search_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  return <SearchPageClient recentRuns={recentRuns ?? []} />
}
```

### `src/app/(dashboard)/search/SearchPageClient.tsx`

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, MapPin, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

const US_CITIES = [
  { city: 'Houston', state: 'TX' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Dallas', state: 'TX' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Miami', state: 'FL' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Charlotte', state: 'NC' },
]

const STATUS_COLORS = {
  pending:   'bg-slate-100 text-slate-600',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
}

export function SearchPageClient({ recentRuns }: { recentRuns: any[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    city: '',
    state: 'TX',
    max_results: '50',
  })

  function selectPreset(city: string, state: string) {
    setForm(prev => ({ ...prev, city, state }))
  }

  async function handleSubmit() {
    if (!form.city.trim()) {
      toast.error('Please enter a city')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: form.city.trim(),
          state: form.state,
          max_results: parseInt(form.max_results),
        }),
      })

      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Search started for ${form.city}, ${form.state}`)
        router.push(`/search/${data.data.searchRunId}`)
      }
    } catch (e) {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Find Salons</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Search Google Maps for hair salons in US cities
        </p>
      </div>

      {/* Search form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        {/* Quick city presets */}
        <div>
          <Label className="text-xs font-medium text-slate-600 mb-2 block">
            quick select
          </Label>
          <div className="flex flex-wrap gap-2">
            {US_CITIES.map(({ city, state }) => (
              <button
                key={city}
                onClick={() => selectPreset(city, state)}
                className={`
                  px-3 py-1.5 text-xs rounded-lg border transition-colors
                  ${form.city === city
                    ? 'bg-violet-50 border-violet-300 text-violet-700 font-medium'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }
                `}
              >
                {city}, {state}
              </button>
            ))}
          </div>
        </div>

        {/* Custom city input */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="city" className="text-xs font-medium text-slate-600">
              city
            </Label>
            <Input
              id="city"
              placeholder="Houston"
              value={form.city}
              onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">state</Label>
            <Input
              placeholder="TX"
              value={form.state}
              onChange={e => setForm(prev => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))}
              maxLength={2}
            />
          </div>
        </div>

        {/* Results count */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">results</Label>
          <Select
            value={form.max_results}
            onValueChange={v => setForm(prev => ({ ...prev, max_results: v }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 salons (fast, ~$0.02)</SelectItem>
              <SelectItem value="50">50 salons (recommended)</SelectItem>
              <SelectItem value="100">100 salons</SelectItem>
              <SelectItem value="200">200 salons (slow)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading || !form.city.trim()}
          className="w-full gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</>
            : <><Search className="w-4 h-4" /> Search {form.city || 'salons'}</>
          }
        </Button>
      </div>

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Recent searches
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {recentRuns.map((run, index) => (
              <a
                key={run.id}
                href={`/search/${run.id}`}
                className={`
                  flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors
                  ${index < recentRuns.length - 1 ? 'border-b border-slate-100' : ''}
                `}
              >
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {run.city}, {run.state}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[run.status as keyof typeof STATUS_COLORS]}`}>
                      {run.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                    {run.total_imported > 0 && ` · ${run.total_imported} leads`}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{run.max_results} max</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### `src/app/(dashboard)/search/[id]/page.tsx`

```tsx
import { requireRole } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SearchRunDetail } from './SearchRunDetail'

export default async function SearchRunPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole('admin')
  const { id } = await params
  const supabase = await createClient()

  const { data: run } = await supabase
    .from('lead_search_runs')
    .select('*')
    .eq('id', id)
    .single()

  if (!run) notFound()

  const { data: leads, count } = await supabase
    .from('salon_leads')
    .select('*, lead_scores(*)', { count: 'exact' })
    .eq('search_run_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  return <SearchRunDetail run={run} leads={leads ?? []} total={count ?? 0} />
}
```

---

## 6. Job Queue

File: `src/lib/jobs/queue.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { JobType, Job } from '@/types'

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: {
    maxAttempts?: number
    runAt?: Date
    dedupeKey?: string  // prevent duplicate jobs
  }
): Promise<string> {
  const adminClient = createAdminClient()

  // Optional deduplication
  if (options?.dedupeKey) {
    const { data: existing } = await adminClient
      .from('jobs')
      .select('id')
      .eq('type', type)
      .in('status', ['pending', 'processing'])
      .contains('payload', { dedupeKey: options.dedupeKey })
      .single()

    if (existing) return existing.id
  }

  const { data, error } = await adminClient
    .from('jobs')
    .insert({
      type,
      payload: options?.dedupeKey
        ? { ...payload, dedupeKey: options.dedupeKey }
        : payload,
      max_attempts: options?.maxAttempts ?? 3,
      next_run_at: (options?.runAt ?? new Date()).toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to enqueue job: ${error.message}`)
  return data.id
}

export async function claimJob(workerId: string): Promise<Job | null> {
  const adminClient = createAdminClient()

  const { data } = await adminClient.rpc('claim_next_job', {
    p_worker_id: workerId,
  })

  return data ?? null
}

export async function completeJob(
  jobId: string,
  result?: Record<string, unknown>
): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient
    .from('jobs')
    .update({
      status: 'completed',
      result: result ?? {},
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

export async function failJob(
  jobId: string,
  error: string,
  currentAttempts: number,
  maxAttempts: number
): Promise<void> {
  const adminClient = createAdminClient()
  const isDead = currentAttempts >= maxAttempts

  // Exponential backoff: 30s, 2m, 10m
  const backoffMs = Math.min(30_000 * Math.pow(4, currentAttempts - 1), 600_000)
  const nextRunAt = new Date(Date.now() + backoffMs).toISOString()

  await adminClient
    .from('jobs')
    .update({
      status: isDead ? 'dead' : 'pending',
      error: error.slice(0, 1000),  // truncate long errors
      locked_at: null,
      locked_by: null,
      next_run_at: isDead ? new Date(Date.now() + 86400000).toISOString() : nextRunAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

export async function releaseStaleJobs(timeoutMinutes = 15): Promise<number> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.rpc('release_stale_jobs', {
    p_timeout_minutes: timeoutMinutes,
  })
  return data ?? 0
}
```

---

## 7. Worker Script

File: `scripts/worker.ts`

```typescript
import 'dotenv/config'
import { claimJob, completeJob, failJob, releaseStaleJobs } from '../src/lib/jobs/queue'
import { handleSearchRun } from '../src/lib/jobs/handlers/search'
import { handleEnrichLead } from '../src/lib/jobs/handlers/enrich'
import { handleEnrichInstagram } from '../src/lib/jobs/handlers/instagram'
import { handleScoreLead } from '../src/lib/jobs/handlers/score'
import type { Job } from '../src/types'

const WORKER_ID = process.env.WORKER_ID ?? `worker-${Date.now()}`
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '2000')

console.log(`[Worker] Starting ${WORKER_ID}`)

async function processJob(job: Job): Promise<void> {
  console.log(`[Worker] Processing ${job.type} ${job.id}`)

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
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWorker(): Promise<void> {
  while (true) {
    try {
      // Release stale jobs every iteration
      const released = await releaseStaleJobs(15)
      if (released > 0) {
        console.log(`[Worker] Released ${released} stale jobs`)
      }

      // Claim next job
      const job = await claimJob(WORKER_ID)

      if (!job) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const start = Date.now()

      try {
        await processJob(job)
        const duration = Date.now() - start
        console.log(`[Worker] Completed ${job.type} ${job.id} in ${duration}ms`)
        await completeJob(job.id, { durationMs: duration })
      } catch (error) {
        const duration = Date.now() - start
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error(`[Worker] Failed ${job.type} ${job.id}: ${errMsg}`)
        await failJob(job.id, errMsg, job.attempts, job.max_attempts)
      }

    } catch (error) {
      console.error('[Worker] Loop error:', error)
      await sleep(POLL_INTERVAL_MS * 2)
    }
  }
}

// Add to package.json: "worker": "tsx scripts/worker.ts"
runWorker().catch(console.error)
```

---

## Definition of Done

- [ ] `src/lib/providers/serper.ts` created and tested against Serper API
- [ ] `src/lib/providers/google-places.ts` created
- [ ] `src/lib/jobs/queue.ts` created with enqueue/claim/complete/fail
- [ ] `scripts/worker.ts` runs and polls for jobs
- [ ] `src/lib/jobs/handlers/search.ts` processes search_run jobs
- [ ] `POST /api/search` creates search run + job (admin only)
- [ ] `GET /api/search` lists past search runs
- [ ] `/search` page shows city presets + recent runs
- [ ] `/search/[id]` page shows leads from run
- [ ] Chain salons filtered out (Great Clips, etc.)
- [ ] Duplicate detection works (no same place_id twice)
- [ ] Worker imports 20+ leads from Houston test run
