# 06 — Scoring Engine
> Depends on: 04_ENRICHMENT_PIPELINE.md, 05_INSTAGRAM_PIPELINE.md
> 8-factor scoring model (0-100), tier detection (A/B/C), priority (1/2/3)

---

## Overview

```
Job: score_lead { leadId }
    ↓
Load: salon_lead + website_snapshot + instagram_snapshot + source_snapshot
    ↓
Calculate 8 factors
    ↓
Total score (0-100)
    ↓
Detect tier (A/B/C) from platform
    ↓
Priority: 1 (≥70), 2 (50-69), 3 (<50)
    ↓
Generate pitch recommendation
    ↓
Save lead_scores
    ↓
Update salon_leads.status = 'scored'
```

---

## 1. Scoring Engine

File: `src/lib/scoring/scoring-engine.ts`

```typescript
import type { SalonLead, LeadScore, ScoringFactors } from '@/types'

export type ScoringInput = {
  lead: SalonLead
  websiteSnapshot: {
    has_online_booking: boolean | null
    has_phone_visible: boolean | null
    platform_hits: { platform: string; tier: string; confidence: number }[] | null
    booking_urls: string[] | null
    cta_strength: string | null
  } | null
  instagramSnapshot: {
    active_last_30_days: boolean | null
    booking_link_in_bio: boolean | null
    detected_platform: string | null
    platform_confidence: number | null
    status: string | null
    followers: number | null
  } | null
  sourceSnapshot: {
    raw: Record<string, unknown> | null
  } | null
}

export type ScoringResult = {
  score: number
  priority: 1 | 2 | 3
  factors: ScoringFactors
  tier: 'A' | 'B' | 'C'
  tier_platform: string | null
  tier_reason: string
  recommended_pitch: string
  scoring_version: 'v1'
}

// ─── Factor max points ─────────────────────────────────────────────────────
// Total: 100 points
// 1. No online booking:  25pts — core pain signal
// 2. Business age:       15pts — proxy via oldest review
// 3. Rating score:       15pts — 4.0-4.5 sweet spot
// 4. Review count:       10pts — 50-300 sweet spot
// 5. After-hours gap:    10pts — closes early or no Sunday
// 6. Instagram active:   10pts — outreach channel
// 7. Has website:         8pts — digital maturity
// 8. Responds to reviews: 7pts — engaged owner

export function calculateScore(input: ScoringInput): ScoringResult {
  const { lead, websiteSnapshot, instagramSnapshot, sourceSnapshot } = input

  // ── Factor 1: No online booking (25 pts) ──────────────────────────────
  const websiteHasBooking = websiteSnapshot?.has_online_booking ?? false
  const instagramHasBooking = instagramSnapshot?.booking_link_in_bio ?? false
  const hasBookingUrl = (websiteSnapshot?.booking_urls?.length ?? 0) > 0

  const noOnlineBooking = (!websiteHasBooking && !instagramHasBooking && !hasBookingUrl)
    ? 25
    : 0

  // ── Factor 2: Business age (15 pts) ──────────────────────────────────
  // Inferred from oldest Google review in raw source data
  const businessAge = scoreBusinessAge(sourceSnapshot?.raw)

  // ── Factor 3: Rating (15 pts) ─────────────────────────────────────────
  const ratingScore = scoreRating(lead.rating)

  // ── Factor 4: Review count (10 pts) ──────────────────────────────────
  const reviewCount = scoreReviewCount(lead.review_count)

  // ── Factor 5: After-hours gap (10 pts) ───────────────────────────────
  const afterHoursGap = scoreAfterHoursGap(lead)

  // ── Factor 6: Instagram active (10 pts) ──────────────────────────────
  const instagramActive = scoreInstagramActive(instagramSnapshot)

  // ── Factor 7: Has website (8 pts) ────────────────────────────────────
  const hasWebsite = lead.website_url ? 8 : 0

  // ── Factor 8: Responds to reviews (7 pts) ────────────────────────────
  const respondsToReviews = scoreRespondsToReviews(sourceSnapshot?.raw)

  const factors: ScoringFactors = {
    noOnlineBooking,
    businessAge,
    ratingScore,
    reviewCount,
    afterHoursGap,
    instagramActive,
    hasWebsite,
    respondsToReviews,
  }

  const score = Math.min(100, Object.values(factors).reduce((a, b) => a + b, 0))
  const priority = score >= 70 ? 1 : score >= 50 ? 2 : 3

  // ── Tier detection ────────────────────────────────────────────────────
  const { tier, tier_platform, tier_reason } = detectTier(
    websiteSnapshot,
    instagramSnapshot
  )

  const recommended_pitch = buildPitch(tier, tier_platform, factors)

  return {
    score,
    priority,
    factors,
    tier,
    tier_platform,
    tier_reason,
    recommended_pitch,
    scoring_version: 'v1',
  }
}

// ─── Factor helpers ────────────────────────────────────────────────────────

function scoreBusinessAge(raw: Record<string, unknown> | null | undefined): number {
  if (!raw) return 5  // unknown → assume some age, give benefit of doubt

  // Try to find oldest review date in raw Google data
  const reviews = (raw.reviews as any[]) ?? []
  if (reviews.length === 0) return 5

  const dates = reviews
    .map((r: any) => {
      if (r.date) return new Date(r.date)
      if (r.time) return new Date(r.time * 1000)
      return null
    })
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()))

  if (dates.length === 0) return 5

  const oldest = new Date(Math.min(...dates.map(d => d.getTime())))
  const yearsOld = (Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 365)

  if (yearsOld >= 3) return 15
  if (yearsOld >= 1) return 10
  if (yearsOld >= 0.5) return 5
  return 0
}

function scoreRating(rating: number | null): number {
  if (!rating) return 0
  // Sweet spot: 4.0-4.5 = busy salon, not already perfect
  if (rating >= 4.0 && rating <= 4.5) return 15
  // High rating = possibly already well-staffed
  if (rating > 4.5) return 10
  // Lower rating = has issues, but still active
  if (rating >= 3.5) return 5
  return 0
}

function scoreReviewCount(count: number | null): number {
  if (!count) return 0
  // Sweet spot: established but not massive chain
  if (count >= 50 && count <= 300) return 10
  if ((count >= 30 && count < 50) || (count > 300 && count <= 500)) return 5
  if (count >= 15 && count < 30) return 3
  return 0
}

function scoreAfterHoursGap(lead: SalonLead): number {
  // Closes before 6 PM OR not open Sunday → misses calls
  if (lead.closes_before_6pm === true) return 10
  if (lead.is_open_sunday === false) return 8
  // Both unknown → partial score (likely misses some calls)
  if (lead.closes_before_6pm === null && lead.is_open_sunday === null) return 5
  return 0
}

function scoreInstagramActive(
  instagram: ScoringInput['instagramSnapshot']
): number {
  if (!instagram || instagram.status === 'not_found' || instagram.status === 'failed') return 0
  if (instagram.status === 'private') return 3  // exists but can't reach
  if (instagram.active_last_30_days) return 10
  if (instagram.followers && instagram.followers > 0) return 5
  return 3
}

function scoreRespondsToReviews(
  raw: Record<string, unknown> | null | undefined
): number {
  if (!raw) return 0
  const reviews = (raw.reviews as any[]) ?? []
  const hasOwnerReply = reviews.some(
    (r: any) => r.ownerResponse || r.owner_response || r.replyTime
  )
  return hasOwnerReply ? 7 : 0
}

// ─── Tier detection ────────────────────────────────────────────────────────

const TIER_A_PLATFORMS = ['square', 'vagaro', 'mindbody', 'acuity']
const TIER_B_PLATFORMS = ['glossgenius', 'booksy', 'fresha', 'boulevard', 'styleseat', 'schedulicity']

function detectTier(
  website: ScoringInput['websiteSnapshot'],
  instagram: ScoringInput['instagramSnapshot']
): { tier: 'A' | 'B' | 'C'; tier_platform: string | null; tier_reason: string } {

  // Collect all detected platforms
  const platformSources: { platform: string; source: string; confidence: number }[] = []

  // From website platform hits
  for (const hit of (website?.platform_hits ?? [])) {
    platformSources.push({ platform: hit.platform, source: 'website', confidence: hit.confidence })
  }

  // From website booking URLs
  for (const url of (website?.booking_urls ?? [])) {
    const detected = detectPlatformFromUrl(url)
    if (detected) {
      platformSources.push({ platform: detected, source: 'booking_url', confidence: 0.90 })
    }
  }

  // From Instagram bio
  if (instagram?.detected_platform && instagram.platform_confidence) {
    platformSources.push({
      platform: instagram.detected_platform,
      source: 'instagram_bio',
      confidence: instagram.platform_confidence,
    })
  }

  if (platformSources.length === 0) {
    return { tier: 'C', tier_platform: null, tier_reason: 'no_platform_detected' }
  }

  // Sort by confidence
  platformSources.sort((a, b) => b.confidence - a.confidence)
  const best = platformSources[0]

  if (TIER_A_PLATFORMS.includes(best.platform)) {
    return {
      tier: 'A',
      tier_platform: best.platform,
      tier_reason: `${best.platform}_via_${best.source}`,
    }
  }

  if (TIER_B_PLATFORMS.includes(best.platform)) {
    return {
      tier: 'B',
      tier_platform: best.platform,
      tier_reason: `${best.platform}_via_${best.source}`,
    }
  }

  return { tier: 'C', tier_platform: best.platform, tier_reason: 'unknown_platform' }
}

function detectPlatformFromUrl(url: string): string | null {
  const lower = url.toLowerCase()
  if (lower.includes('square.site') || lower.includes('squareup.com')) return 'square'
  if (lower.includes('vagaro.com')) return 'vagaro'
  if (lower.includes('mindbodyonline.com')) return 'mindbody'
  if (lower.includes('acuityscheduling.com')) return 'acuity'
  if (lower.includes('glossgenius.com')) return 'glossgenius'
  if (lower.includes('booksy.com')) return 'booksy'
  if (lower.includes('fresha.com')) return 'fresha'
  if (lower.includes('boulevard.app')) return 'boulevard'
  if (lower.includes('styleseat.com')) return 'styleseat'
  if (lower.includes('schedulicity.com')) return 'schedulicity'
  return null
}

// ─── Pitch builder ─────────────────────────────────────────────────────────

const PITCH_TEMPLATES = {
  A: {
    square:   'AI books directly into your Square calendar — no double-booking, no missed calls.',
    vagaro:   'AI books directly into your Vagaro calendar — answers every call, books while you\'re with clients.',
    mindbody: 'AI books directly into Mindbody — captures every caller even during peak hours.',
    acuity:   'AI books directly into Acuity — your calendar fills itself while you focus on clients.',
    default:  'AI books appointments directly into your calendar — no missed calls, no lost bookings.',
  },
  B: {
    glossgenius: 'AI answers every call and instantly texts your GlossGenius booking link — even at 2 AM.',
    booksy:      'AI answers every call and sends your Booksy link instantly — never miss a booking.',
    fresha:      'AI answers and texts your Fresha link to every caller — 24/7 coverage.',
    boulevard:   'AI answers calls and sends your Boulevard booking link automatically.',
    styleseat:   'AI answers calls and sends your StyleSeat profile link — captures every potential client.',
    default:     'AI answers every call and instantly texts your booking link — never miss a client.',
  },
  C: {
    default: 'AI captures every caller\'s name, number, and service request — so you never lose a lead again.',
  },
}

function buildPitch(
  tier: 'A' | 'B' | 'C',
  platform: string | null,
  factors: ScoringFactors
): string {
  if (tier === 'A' && platform) {
    return PITCH_TEMPLATES.A[platform as keyof typeof PITCH_TEMPLATES.A]
      ?? PITCH_TEMPLATES.A.default
  }
  if (tier === 'B' && platform) {
    return PITCH_TEMPLATES.B[platform as keyof typeof PITCH_TEMPLATES.B]
      ?? PITCH_TEMPLATES.B.default
  }
  return PITCH_TEMPLATES.C.default
}
```

---

## 2. Score Job Handler

File: `src/lib/jobs/handlers/score.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateScore } from '@/lib/scoring/scoring-engine'

export type ScoreLeadPayload = {
  leadId: string
}

export async function handleScoreLead(payload: ScoreLeadPayload): Promise<void> {
  const { leadId } = payload
  const adminClient = createAdminClient()

  // Load all data needed for scoring
  const [
    { data: lead },
    { data: websiteSnapshot },
    { data: instagramSnapshot },
    { data: sourceSnapshot },
  ] = await Promise.all([
    adminClient.from('salon_leads').select('*').eq('id', leadId).single(),
    adminClient.from('website_snapshots').select('*').eq('lead_id', leadId).single(),
    adminClient.from('instagram_snapshots').select('*').eq('lead_id', leadId).single(),
    adminClient.from('lead_source_snapshots').select('*').eq('lead_id', leadId)
      .order('created_at').limit(1).single(),
  ])

  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  // Calculate score
  const result = calculateScore({
    lead,
    websiteSnapshot: websiteSnapshot as any,
    instagramSnapshot: instagramSnapshot as any,
    sourceSnapshot: sourceSnapshot as any,
  })

  // Upsert score (replace if scoring again)
  await adminClient
    .from('lead_scores')
    .upsert({
      lead_id: leadId,
      score: result.score,
      priority: result.priority,
      factors: result.factors,
      tier: result.tier,
      tier_platform: result.tier_platform,
      tier_reason: result.tier_reason,
      recommended_pitch: result.recommended_pitch,
      scoring_version: result.scoring_version,
      scored_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,scoring_version' })

  // Update lead status
  await adminClient
    .from('salon_leads')
    .update({
      status: 'scored',
      scored_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    // Only update if not already in outreach pipeline
    .in('status', ['new', 'enriching', 'enriched', 'scored'])
}
```

---

## 3. Score API Routes

File: `src/app/api/leads/[id]/score/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile } = await getSessionUser()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const jobId = await enqueueJob('score_lead', { leadId: id })

  return NextResponse.json({ data: { jobId, status: 'queued' } })
}
```

---

## 4. Score Display Components

### `src/components/leads/ScoreBadge.tsx`

```tsx
import { cn } from '@/lib/utils'

type Props = {
  score: number
  priority: 1 | 2 | 3
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const PRIORITY_CONFIG = {
  1: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'High' },
  2: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'Med'  },
  3: { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',   label: 'Low'  },
}

export function ScoreBadge({ score, priority, size = 'md', showLabel = false }: Props) {
  const config = PRIORITY_CONFIG[priority]

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-lg border font-medium',
      config.bg, config.text, config.border,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        priority === 1 ? 'bg-emerald-500' :
        priority === 2 ? 'bg-amber-500' : 'bg-slate-400'
      )} />
      <span>{score}</span>
      {showLabel && <span className="opacity-70">/ {config.label}</span>}
    </div>
  )
}
```

### `src/components/leads/TierBadge.tsx`

```tsx
import { cn } from '@/lib/utils'

type Props = {
  tier: 'A' | 'B' | 'C'
  platform?: string | null
  size?: 'sm' | 'md'
}

const TIER_CONFIG = {
  A: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', label: 'Full Sync' },
  B: { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   label: 'Link Only' },
  C: { bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-200',  label: 'Manual'    },
}

const PLATFORM_LABELS: Record<string, string> = {
  square: 'Square', vagaro: 'Vagaro', mindbody: 'Mindbody', acuity: 'Acuity',
  glossgenius: 'GlossGenius', booksy: 'Booksy', fresha: 'Fresha',
  boulevard: 'Boulevard', styleseat: 'StyleSeat', schedulicity: 'Schedulicity',
}

export function TierBadge({ tier, platform, size = 'md' }: Props) {
  const config = TIER_CONFIG[tier]
  const platformLabel = platform ? (PLATFORM_LABELS[platform] ?? platform) : null

  return (
    <div className={cn(
      'inline-flex items-center gap-1 rounded-lg border font-medium',
      config.bg, config.text, config.border,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
    )}>
      <span>Tier {tier}</span>
      {platformLabel && (
        <>
          <span className="opacity-40">·</span>
          <span>{platformLabel}</span>
        </>
      )}
    </div>
  )
}
```

### `src/components/leads/ScoreBreakdown.tsx`

```tsx
import type { ScoringFactors } from '@/types'

type Props = {
  factors: ScoringFactors
  score: number
}

const FACTOR_LABELS: Record<keyof ScoringFactors, { label: string; max: number; description: string }> = {
  noOnlineBooking:   { label: 'No online booking',    max: 25, description: '100% reliant on phone calls' },
  businessAge:       { label: 'Business age (3+ yrs)', max: 15, description: 'Established, proven business' },
  ratingScore:       { label: 'Rating (4.0–4.5)',      max: 15, description: 'Busy but not perfect' },
  reviewCount:       { label: 'Review count (50–300)', max: 10, description: 'Active customer base' },
  afterHoursGap:     { label: 'After-hours gap',       max: 10, description: 'Closes early or no Sunday' },
  instagramActive:   { label: 'Instagram active',      max: 10, description: 'Posted in last 30 days' },
  hasWebsite:        { label: 'Has website',           max:  8, description: 'Digital-aware owner' },
  respondsToReviews: { label: 'Responds to reviews',  max:  7, description: 'Engaged, cares about reputation' },
}

export function ScoreBreakdown({ factors, score }: Props) {
  const entries = Object.entries(factors) as [keyof ScoringFactors, number][]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-700">Score breakdown</span>
        <span className="text-sm font-semibold text-slate-900">{score} / 100</span>
      </div>

      {entries
        .sort(([, a], [, b]) => b - a)
        .map(([key, value]) => {
          const config = FACTOR_LABELS[key]
          const pct = (value / config.max) * 100

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">{config.label}</span>
                <span className={`text-xs font-medium ${value > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
                  {value} / {config.max}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    value >= config.max * 0.8 ? 'bg-emerald-500' :
                    value > 0 ? 'bg-violet-400' : 'bg-slate-200'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
    </div>
  )
}
```

---

## Definition of Done

- [ ] `scoring-engine.ts` calculates all 8 factors correctly
- [ ] Unit tests: each factor tested with edge cases (null values, boundary values)
- [ ] Tier detection correctly identifies Square/Vagaro as Tier A
- [ ] Pitch templates generated per tier + platform
- [ ] `score_lead` job handler saves to `lead_scores`
- [ ] Lead status updated to `scored`
- [ ] `ScoreBadge` renders with correct color per priority
- [ ] `TierBadge` shows platform name when available
- [ ] `ScoreBreakdown` shows all 8 factors with progress bars
- [ ] Re-scoring (after Instagram) updates existing score row
