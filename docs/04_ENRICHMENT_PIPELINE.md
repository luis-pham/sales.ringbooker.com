# 04 — Enrichment Pipeline
> Depends on: 03_SEARCH_PIPELINE.md
> Crawls website, detects booking platform, parses hours

---

## Overview

```
Job: enrich_lead { leadId }
    ↓
Step 1: Google Places Details (if missing hours/website)
Step 2: Website crawl → platform detection
Step 3: Find Instagram URL
Step 4: Parse hours → closes_before_6pm, is_open_sunday
Step 5: Update lead status → 'enriched'
Step 6: Queue: enrich_instagram + score_lead
```

---

## 1. Website Crawler

File: `src/lib/enrichment/website-crawler.ts`

```typescript
import * as cheerio from 'cheerio'

export type CrawlResult = {
  url: string
  status: 'crawled' | 'failed' | 'skipped' | 'blocked'
  phones: string[]
  emails: string[]
  booking_urls: string[]
  platform_hits: PlatformHit[]
  cta_strength: 'strong' | 'weak' | 'none'
  has_online_booking: boolean
  has_phone_visible: boolean
  instagram_links: string[]
  response_status: number | null
  crawl_duration_ms: number
  error?: string
}

export type PlatformHit = {
  platform: string
  confidence: number
  evidence: string
  tier: 'A' | 'B' | 'C'
}

const PHONE_REGEX = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g

const STRONG_CTA = [
  'book now', 'book appointment', 'schedule now',
  'book online', 'schedule appointment', 'make appointment',
  'reserve now', 'book today', 'get appointment'
]

const WEAK_CTA = ['contact us', 'call us', 'appointment', 'booking', 'schedule']

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const start = Date.now()

  const normalized = url.startsWith('http') ? url : `https://${url}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(normalized, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RingBookerBot/1.0; +https://ringbooker.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      return {
        url: normalized,
        status: response.status === 403 || response.status === 429 ? 'blocked' : 'failed',
        phones: [], emails: [], booking_urls: [], platform_hits: [],
        cta_strength: 'none', has_online_booking: false, has_phone_visible: false,
        instagram_links: [], response_status: response.status,
        crawl_duration_ms: Date.now() - start,
        error: `HTTP ${response.status}`,
      }
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) {
      return {
        url: normalized,
        status: 'skipped',
        phones: [], emails: [], booking_urls: [], platform_hits: [],
        cta_strength: 'none', has_online_booking: false, has_phone_visible: false,
        instagram_links: [], response_status: response.status,
        crawl_duration_ms: Date.now() - start,
        error: 'Not HTML',
      }
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract all links
    const allLinks: string[] = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      if (href) allLinks.push(href)
    })

    // Extract script sources
    const scriptSrcs: string[] = []
    $('script[src]').each((_, el) => {
      scriptSrcs.push($(el).attr('src') ?? '')
    })

    const fullText = $('body').text().toLowerCase()

    // Extract phones
    const phones = extractPhones(html)

    // Extract emails
    const emails = extractEmails(html)

    // Extract booking URLs
    const booking_urls = extractBookingUrls(allLinks)

    // Detect platforms
    const { detectPlatforms } = await import('./platform-detector')
    const platform_hits = detectPlatforms(html, allLinks, scriptSrcs)

    // CTA strength
    const cta_strength = detectCtaStrength(fullText)

    // Instagram links
    const instagram_links = allLinks
      .filter(l => l.includes('instagram.com/'))
      .map(l => l.split('?')[0])
      .filter((l, i, arr) => arr.indexOf(l) === i)
      .slice(0, 3)

    return {
      url: normalized,
      status: 'crawled',
      phones,
      emails,
      booking_urls,
      platform_hits,
      cta_strength,
      has_online_booking: booking_urls.length > 0 || platform_hits.length > 0,
      has_phone_visible: phones.length > 0,
      instagram_links,
      response_status: response.status,
      crawl_duration_ms: Date.now() - start,
    }

  } catch (error) {
    return {
      url: normalized,
      status: 'failed',
      phones: [], emails: [], booking_urls: [], platform_hits: [],
      cta_strength: 'none', has_online_booking: false, has_phone_visible: false,
      instagram_links: [], response_status: null,
      crawl_duration_ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function extractPhones(html: string): string[] {
  const matches = [...html.matchAll(PHONE_REGEX)]
  const phones = matches.map(m => m[0].replace(/\D/g, ''))
    .filter(p => p.length === 10 || (p.length === 11 && p[0] === '1'))
    .map(p => p.length === 10 ? `+1${p}` : `+${p}`)

  return [...new Set(phones)].slice(0, 5)
}

function extractEmails(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const matches = [...html.matchAll(emailRegex)]
  return [...new Set(matches.map(m => m[0].toLowerCase()))]
    .filter(e => !e.includes('example.com') && !e.includes('test.com'))
    .slice(0, 3)
}

function extractBookingUrls(links: string[]): string[] {
  const BOOKING_DOMAINS = [
    'square.site', 'squareup.com/appointments', 'book.squareup.com',
    'vagaro.com', 'glossgenius.com', 'booksy.com', 'fresha.com',
    'boulevard.app', 'styleseat.com', 'schedulicity.com',
    'mindbodyonline.com', 'acuityscheduling.com',
    'calendly.com', 'appointy.com', 'setmore.com',
  ]

  return links
    .filter(link => BOOKING_DOMAINS.some(d => link.includes(d)))
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .slice(0, 5)
}

function detectCtaStrength(text: string): 'strong' | 'weak' | 'none' {
  if (STRONG_CTA.some(cta => text.includes(cta))) return 'strong'
  if (WEAK_CTA.some(cta => text.includes(cta))) return 'weak'
  return 'none'
}
```

---

## 2. Platform Detector

File: `src/lib/enrichment/platform-detector.ts`

```typescript
export type PlatformHit = {
  platform: string
  confidence: number
  evidence: string
  tier: 'A' | 'B' | 'C'
}

const PLATFORMS: Record<string, {
  tier: 'A' | 'B' | 'C'
  urlPatterns: string[]
  scriptPatterns: string[]
}> = {
  square: {
    tier: 'A',
    urlPatterns: ['square.site', 'squareup.com/appointments', 'book.squareup.com'],
    scriptPatterns: ['js.squareup.com', 'js.squareupsandbox.com'],
  },
  vagaro: {
    tier: 'A',
    urlPatterns: ['vagaro.com'],
    scriptPatterns: ['vagaro.com/api', 'vagaro.com/widget'],
  },
  mindbody: {
    tier: 'A',
    urlPatterns: ['mindbodyonline.com', 'widgets.mindbodyonline.com'],
    scriptPatterns: ['mindbodyonline.com'],
  },
  acuity: {
    tier: 'A',
    urlPatterns: ['acuityscheduling.com'],
    scriptPatterns: ['acuityscheduling.com'],
  },
  glossgenius: {
    tier: 'B',
    urlPatterns: ['glossgenius.com'],
    scriptPatterns: [],
  },
  booksy: {
    tier: 'B',
    urlPatterns: ['booksy.com'],
    scriptPatterns: ['booksy.com'],
  },
  fresha: {
    tier: 'B',
    urlPatterns: ['fresha.com'],
    scriptPatterns: ['fresha.com'],
  },
  boulevard: {
    tier: 'B',
    urlPatterns: ['boulevard.app', 'joinblvd.com'],
    scriptPatterns: [],
  },
  styleseat: {
    tier: 'B',
    urlPatterns: ['styleseat.com'],
    scriptPatterns: [],
  },
  schedulicity: {
    tier: 'B',
    urlPatterns: ['schedulicity.com'],
    scriptPatterns: ['schedulicity.com'],
  },
}

export function detectPlatforms(
  html: string,
  links: string[],
  scriptSrcs: string[]
): PlatformHit[] {
  const hits: PlatformHit[] = []
  const allText = [html, ...links, ...scriptSrcs].join(' ').toLowerCase()

  for (const [platform, config] of Object.entries(PLATFORMS)) {
    let confidence = 0
    let evidence = ''

    // Check URL patterns in links
    for (const pattern of config.urlPatterns) {
      const found = links.find(l => l.toLowerCase().includes(pattern))
      if (found) {
        confidence = Math.max(confidence, 0.95)
        evidence = `link: ${found.slice(0, 80)}`
        break
      }
    }

    // Check script sources
    for (const pattern of config.scriptPatterns) {
      const found = scriptSrcs.find(s => s.toLowerCase().includes(pattern))
      if (found) {
        confidence = Math.max(confidence, 0.90)
        evidence = evidence || `script: ${found.slice(0, 80)}`
        break
      }
    }

    // Check HTML body for platform mentions
    if (confidence === 0) {
      for (const pattern of config.urlPatterns) {
        if (allText.includes(pattern)) {
          confidence = 0.75
          evidence = `html_mention: ${pattern}`
          break
        }
      }
    }

    if (confidence > 0) {
      hits.push({ platform, confidence, evidence, tier: config.tier })
    }
  }

  // Sort by confidence
  return hits.sort((a, b) => b.confidence - a.confidence)
}
```

---

## 3. Enrich Job Handler

File: `src/lib/jobs/handlers/enrich.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { crawlWebsite } from '@/lib/enrichment/website-crawler'
import { getPlaceDetails } from '@/lib/providers/google-places'
import { enqueueJob } from '@/lib/jobs/queue'

export type EnrichLeadPayload = {
  leadId: string
}

export async function handleEnrichLead(payload: EnrichLeadPayload): Promise<void> {
  const { leadId } = payload
  const adminClient = createAdminClient()

  // Load lead
  const { data: lead } = await adminClient
    .from('salon_leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  // Mark as enriching
  await adminClient
    .from('salon_leads')
    .update({ status: 'enriching' })
    .eq('id', leadId)

  const updates: Record<string, unknown> = {}

  // Step 1: Google Places details if missing hours or website
  if (lead.google_place_id && (!lead.hours_raw || !lead.website_url)) {
    try {
      const details = await getPlaceDetails(lead.google_place_id)
      if (details) {
        if (!lead.website_url && details.website_url) {
          updates.website_url = details.website_url
        }
        if (!lead.hours_raw && details.hours_raw) {
          updates.hours_raw = details.hours_raw
          updates.is_open_sunday = details.is_open_sunday
          updates.closes_before_6pm = details.closes_before_6pm
        }
        if (!lead.phone && details.phone) {
          updates.phone = details.phone
        }
        if (!lead.rating && details.rating) {
          updates.rating = details.rating
        }
        if (!lead.review_count && details.review_count) {
          updates.review_count = details.review_count
        }
      }
    } catch (e) {
      console.warn(`Places API failed for ${leadId}:`, e)
    }
  }

  // Step 2: Website crawl
  const websiteUrl = updates.website_url as string ?? lead.website_url
  if (websiteUrl) {
    try {
      const crawlResult = await crawlWebsite(websiteUrl)

      // Save website snapshot
      await adminClient
        .from('website_snapshots')
        .upsert({
          lead_id: leadId,
          url: crawlResult.url,
          status: crawlResult.status,
          phones: crawlResult.phones,
          emails: crawlResult.emails,
          booking_urls: crawlResult.booking_urls,
          platform_hits: crawlResult.platform_hits,
          cta_strength: crawlResult.cta_strength,
          has_online_booking: crawlResult.has_online_booking,
          has_phone_visible: crawlResult.has_phone_visible,
          instagram_links: crawlResult.instagram_links,
          response_status: crawlResult.response_status,
          error: crawlResult.error,
          crawl_duration_ms: crawlResult.crawl_duration_ms,
          crawled_at: new Date().toISOString(),
        }, { onConflict: 'lead_id' })

      // Update phone if not set
      if (!lead.phone && crawlResult.phones[0]) {
        updates.phone = crawlResult.phones[0]
      }

      // Find Instagram from website
      if (crawlResult.instagram_links[0] && !lead.instagram_url) {
        const handle = extractInstagramHandle(crawlResult.instagram_links[0])
        if (handle) {
          updates.instagram_url = crawlResult.instagram_links[0]
          // Queue Instagram enrichment
          await enqueueJob('enrich_instagram', {
            leadId,
            instagramHandle: handle,
          })
        }
      }

    } catch (e) {
      console.warn(`Website crawl failed for ${leadId}:`, e)
    }
  }

  // Step 3: Apply hours updates if not already set
  if (!lead.hours_raw && !updates.hours_raw) {
    // Hours not available — mark as unknown
    updates.is_open_sunday = null
    updates.closes_before_6pm = null
  }

  // Update lead
  await adminClient
    .from('salon_leads')
    .update({
      ...updates,
      status: 'enriched',
      enriched_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  // Queue scoring (always, even if Instagram not found)
  await enqueueJob('score_lead', { leadId }, {
    dedupeKey: `score_${leadId}`,
  })
}

function extractInstagramHandle(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    const path = parsed.pathname.replace(/^\//, '').replace(/\/$/, '')
    const handle = path.split('/')[0]
    // Valid Instagram handle: letters, numbers, periods, underscores, 1-30 chars
    if (/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
      return handle
    }
    return null
  } catch {
    return null
  }
}
```

---

## Definition of Done

- [ ] `website-crawler.ts` handles timeout, blocked sites, non-HTML gracefully
- [ ] `platform-detector.ts` correctly identifies Square/Vagaro from test URLs
- [ ] `handlers/enrich.ts` saves website_snapshot to DB
- [ ] Google Places called only when hours/website missing
- [ ] Instagram handle extracted from website links
- [ ] Lead status updates: `enriching` → `enriched`
- [ ] `score_lead` job queued after enrichment completes
- [ ] `enrich_instagram` job queued if Instagram URL found
- [ ] Failed crawls save error to website_snapshots (not crash worker)
