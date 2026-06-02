# 05 — Instagram Pipeline
> Depends on: 04_ENRICHMENT_PIPELINE.md
> Fetches Instagram profile via Apify, detects booking platform from bio

---

## Overview

```
Job: enrich_instagram { leadId, instagramHandle }
    ↓
Apify: instagram-profile-scraper actor
    ↓
Parse: followers, bio, bio links, last post date
    ↓
Detect booking platform from bio links
    ↓
Save instagram_snapshots
    ↓
Update salon_leads.instagram_url
    ↓
Re-queue score_lead (score may change)
```

---

## 1. Instagram Provider

File: `src/lib/enrichment/instagram-provider.ts`

```typescript
const APIFY_BASE = 'https://api.apify.com/v2'
const INSTAGRAM_SCRAPER_ACTOR = 'apify~instagram-profile-scraper'

export type InstagramProfile = {
  handle: string
  profileUrl: string
  followers: number | null
  bio: string | null
  bioLinks: string[]
  lastPostAt: Date | null
  postCount30d: number
  activeLast30Days: boolean
  bookingLinkInBio: boolean
  detectedPlatform: string | null
  platformConfidence: number
  status: 'fetched' | 'not_found' | 'private' | 'failed'
  raw: Record<string, unknown>
}

// Booking platform patterns to check in bio links
const BIO_LINK_PLATFORMS: Record<string, { patterns: string[]; tier: string }> = {
  square:      { patterns: ['square.site', 'squareup.com', 'book.squareup.com'], tier: 'A' },
  vagaro:      { patterns: ['vagaro.com'], tier: 'A' },
  mindbody:    { patterns: ['mindbodyonline.com'], tier: 'A' },
  acuity:      { patterns: ['acuityscheduling.com'], tier: 'A' },
  glossgenius: { patterns: ['glossgenius.com'], tier: 'B' },
  booksy:      { patterns: ['booksy.com'], tier: 'B' },
  fresha:      { patterns: ['fresha.com'], tier: 'B' },
  boulevard:   { patterns: ['boulevard.app', 'joinblvd.com'], tier: 'B' },
  styleseat:   { patterns: ['styleseat.com'], tier: 'B' },
  schedulicity: { patterns: ['schedulicity.com'], tier: 'B' },
  linktree:    { patterns: ['linktr.ee'], tier: 'C' },  // may contain booking link
}

export async function fetchInstagramProfile(
  handle: string
): Promise<InstagramProfile | null> {
  try {
    // Start Apify actor run
    const runId = await startApifyRun(handle)
    if (!runId) return null

    // Poll for completion (max 60 seconds)
    const result = await pollApifyRun(runId, 60_000)
    if (!result) return null

    return parseInstagramResult(handle, result)
  } catch (error) {
    console.error(`Instagram fetch failed for ${handle}:`, error)
    return {
      handle,
      profileUrl: `https://instagram.com/${handle}`,
      followers: null,
      bio: null,
      bioLinks: [],
      lastPostAt: null,
      postCount30d: 0,
      activeLast30Days: false,
      bookingLinkInBio: false,
      detectedPlatform: null,
      platformConfidence: 0,
      status: 'failed',
      raw: { error: String(error) },
    }
  }
}

async function startApifyRun(handle: string): Promise<string | null> {
  const response = await fetch(
    `${APIFY_BASE}/acts/${INSTAGRAM_SCRAPER_ACTOR}/runs`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernames: [handle],
        resultsLimit: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )

  if (!response.ok) {
    throw new Error(`Apify start failed: ${response.status}`)
  }

  const data = await response.json()
  return data.data?.id ?? null
}

async function pollApifyRun(
  runId: string,
  timeoutMs: number
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs
  const pollInterval = 3000

  while (Date.now() < deadline) {
    await sleep(pollInterval)

    const response = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}`,
      {
        headers: { 'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!response.ok) continue

    const run = await response.json()
    const status = run.data?.status

    if (status === 'SUCCEEDED') {
      // Fetch dataset items
      const datasetId = run.data?.defaultDatasetId
      if (!datasetId) return null

      const itemsRes = await fetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?limit=1`,
        {
          headers: { 'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}` },
        }
      )

      if (!itemsRes.ok) return null
      const items = await itemsRes.json()
      return items[0] ?? null
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      return null
    }
    // RUNNING or READY → keep polling
  }

  return null  // Timeout
}

function parseInstagramResult(
  handle: string,
  raw: Record<string, unknown>
): InstagramProfile {
  const followers = (raw.followersCount as number) ?? null
  const bio = (raw.biography as string) ?? null
  const bioLinks: string[] = []

  // Extract bio links
  if (raw.externalUrl) bioLinks.push(raw.externalUrl as string)
  if (Array.isArray(raw.bioLinks)) {
    for (const link of raw.bioLinks) {
      if (link?.url) bioLinks.push(link.url)
    }
  }

  // Last post date
  let lastPostAt: Date | null = null
  if (raw.latestIgtvVideo || raw.latestPosts) {
    const posts = (raw.latestPosts as any[]) ?? []
    if (posts.length > 0 && posts[0].timestamp) {
      lastPostAt = new Date(posts[0].timestamp)
    }
  }

  // Active in last 30 days
  const activeLast30Days = lastPostAt
    ? (Date.now() - lastPostAt.getTime()) < 30 * 24 * 60 * 60 * 1000
    : false

  // Detect booking platform
  const { platform, confidence } = detectPlatformFromBioLinks(bioLinks)
  const bookingLinkInBio = confidence > 0.5

  // Handle not found / private
  let status: InstagramProfile['status'] = 'fetched'
  if (raw.error || !raw.username) status = 'not_found'
  if (raw.isPrivate) status = 'private'

  return {
    handle,
    profileUrl: `https://instagram.com/${handle}`,
    followers,
    bio,
    bioLinks,
    lastPostAt,
    postCount30d: countPostsLast30Days(raw),
    activeLast30Days,
    bookingLinkInBio,
    detectedPlatform: platform,
    platformConfidence: confidence,
    status,
    raw,
  }
}

function detectPlatformFromBioLinks(
  links: string[]
): { platform: string | null; confidence: number } {
  for (const link of links) {
    const lowerLink = link.toLowerCase()
    for (const [platform, config] of Object.entries(BIO_LINK_PLATFORMS)) {
      if (config.patterns.some(p => lowerLink.includes(p))) {
        return { platform, confidence: 0.95 }
      }
    }
  }

  // Check for link aggregators (linktree, etc.) — lower confidence
  for (const link of links) {
    if (link.includes('linktr.ee') || link.includes('beacons.ai')) {
      return { platform: 'linktree', confidence: 0.4 }
    }
  }

  return { platform: null, confidence: 0 }
}

function countPostsLast30Days(raw: Record<string, unknown>): number {
  const posts = (raw.latestPosts as any[]) ?? []
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  return posts.filter(p => p.timestamp && new Date(p.timestamp).getTime() > cutoff).length
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

## 2. Instagram Job Handler

File: `src/lib/jobs/handlers/instagram.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchInstagramProfile } from '@/lib/enrichment/instagram-provider'
import { enqueueJob } from '@/lib/jobs/queue'

export type EnrichInstagramPayload = {
  leadId: string
  instagramHandle: string
}

export async function handleEnrichInstagram(
  payload: EnrichInstagramPayload
): Promise<void> {
  const { leadId, instagramHandle } = payload
  const adminClient = createAdminClient()

  // Fetch from Apify
  const profile = await fetchInstagramProfile(instagramHandle)

  if (!profile) {
    await adminClient
      .from('instagram_snapshots')
      .upsert({
        lead_id: leadId,
        handle: instagramHandle,
        status: 'failed',
        error: 'No profile returned',
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'lead_id' })
    return
  }

  // Save snapshot
  await adminClient
    .from('instagram_snapshots')
    .upsert({
      lead_id: leadId,
      handle: profile.handle,
      profile_url: profile.profileUrl,
      followers: profile.followers,
      bio: profile.bio,
      bio_links: profile.bioLinks,
      last_post_at: profile.lastPostAt?.toISOString() ?? null,
      post_count_30d: profile.postCount30d,
      active_last_30_days: profile.activeLast30Days,
      booking_link_in_bio: profile.bookingLinkInBio,
      detected_platform: profile.detectedPlatform,
      platform_confidence: profile.platformConfidence,
      status: profile.status,
      raw: profile.raw,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'lead_id' })

  // Update lead instagram_url if not set
  const { data: lead } = await adminClient
    .from('salon_leads')
    .select('instagram_url')
    .eq('id', leadId)
    .single()

  if (lead && !lead.instagram_url) {
    await adminClient
      .from('salon_leads')
      .update({ instagram_url: profile.profileUrl })
      .eq('id', leadId)
  }

  // Re-queue scoring with updated Instagram data
  await enqueueJob('score_lead', { leadId }, {
    dedupeKey: `score_${leadId}_v2`,
  })
}
```

---

## Definition of Done

- [ ] `instagram-provider.ts` calls Apify API and parses profile
- [ ] Platform detection from bio links works (Square, Vagaro, etc.)
- [ ] `instagram_snapshots` saved to DB correctly
- [ ] Status correctly set: `fetched` / `not_found` / `private` / `failed`
- [ ] Lead `instagram_url` updated if not already set
- [ ] Score re-queued after Instagram data available
- [ ] Timeout handled gracefully (60s max per profile)
- [ ] Apify token never exposed to client side
