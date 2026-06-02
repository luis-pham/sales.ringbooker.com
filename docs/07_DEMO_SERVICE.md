# 07 — Demo Service
> Depends on: 01_DATABASE_SCHEMA.md, 06_SCORING_ENGINE.md
> Build demo per salon, auto + manual, track via manual confirm (webhook deferred)

---

## Overview

```
2 modes to create demo:

AUTO (background job):
  Lead scored → priority 1
      ↓
  Job: auto_create_demo
      ↓
  Build payload from lead data
      ↓
  [FUTURE] Call RingBooker API
      ↓
  Save demo record + demoUrl
      ↓
  Lead status → outreach_ready

MANUAL (admin UI):
  Admin clicks "Build Demo" (single or bulk)
      ↓
  Same flow above

TRACKING (manual now, auto later):
  Outreacher marks: shared / viewed / completed
  [FUTURE] RingBooker webhook auto-updates these
```

---

## 1. Demo Service

File: `src/lib/demo/demo-service.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { SalonLead } from '@/types'

export type DemoPayload = {
  salesLeadId: string
  salonName: string
  demoVertical: 'hair-salon'
  city: string
  state: string
  services: string[]
  staffNames: string[]
  primaryHours: string | null
  notes: string | null
  websiteUrl: string | null
  instagramUrl: string | null
}

export type DemoResult = {
  demoUrl: string
  requestId: string | null
  sessionId: string | null
  expiresAt: string | null
}

// ─── Build payload from lead data ─────────────────────────────────────────

export function buildDemoPayload(
  lead: SalonLead,
  options?: { notes?: string }
): DemoPayload {
  return {
    salesLeadId: lead.id,
    salonName: lead.name,
    demoVertical: 'hair-salon',
    city: lead.city ?? '',
    state: lead.state ?? '',
    services: extractServices(lead),
    staffNames: [],
    primaryHours: formatHours(lead.hours_raw),
    notes: options?.notes ?? null,
    websiteUrl: lead.website_url,
    instagramUrl: lead.instagram_url,
  }
}

function extractServices(lead: SalonLead): string[] {
  // Default hair salon services if none detected
  // [FUTURE] Can be enriched from website crawl data
  const defaults = [
    'Haircut & Style',
    'Hair Coloring',
    'Highlights & Balayage',
    'Blowout',
    'Hair Treatment',
  ]
  return defaults
}

function formatHours(hoursRaw: Record<string, unknown> | null): string | null {
  if (!hoursRaw) return null

  try {
    // Google Places hours format
    const periods = hoursRaw.periods as any[]
    if (!periods?.length) return null

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const lines = periods.map((p: any) => {
      const day = dayNames[p.open?.day ?? 0]
      const open = formatTime(p.open?.hour, p.open?.minute)
      const close = formatTime(p.close?.hour, p.close?.minute)
      return `${day} ${open}–${close}`
    })

    return lines.join(', ')
  } catch {
    return null
  }
}

function formatTime(hour: number | undefined, minute: number | undefined): string {
  if (hour === undefined) return ''
  const h = hour % 12 || 12
  const m = (minute ?? 0).toString().padStart(2, '0')
  const ampm = hour < 12 ? 'AM' : 'PM'
  return `${h}:${m} ${ampm}`
}

// ─── Call RingBooker API ───────────────────────────────────────────────────

export async function callRingBookerDemoAPI(
  payload: DemoPayload
): Promise<DemoResult> {
  const apiUrl = process.env.RINGBOOKER_INTERNAL_API_URL
  const apiKey = process.env.RINGBOOKER_INTERNAL_API_KEY

  // [FUTURE] When RingBooker internal API is ready:
  if (apiUrl && apiKey) {
    const response = await fetch(
      `${apiUrl}/api/backend/internal/sales/demo-context`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`RingBooker API error ${response.status}: ${error}`)
    }

    const data = await response.json()
    return {
      demoUrl: data.demoUrl,
      requestId: data.requestId ?? null,
      sessionId: data.sessionId ?? null,
      expiresAt: data.expiresAt ?? null,
    }
  }

  // [STUB] RingBooker API not yet available
  // Returns a placeholder URL so the rest of the flow works
  console.warn('[Demo] RingBooker API not configured — using stub URL')

  const params = new URLSearchParams({
    salon: payload.salonName,
    city: payload.city,
  })

  return {
    demoUrl: `https://ringbooker.com/demo/hair?${params.toString()}`,
    requestId: null,
    sessionId: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

// ─── Save demo record to DB ────────────────────────────────────────────────

export async function saveDemoRecord(
  leadId: string,
  payload: DemoPayload,
  result: DemoResult,
  createdBy: string | null
): Promise<string> {
  const adminClient = createAdminClient()

  // Check if demo already exists for this lead
  const { data: existing } = await adminClient
    .from('ringbooker_demos')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'prepared')
    .single()

  if (existing) {
    // Update existing demo URL
    await adminClient
      .from('ringbooker_demos')
      .update({
        demo_url: result.demoUrl,
        demo_config: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    return existing.id
  }

  // Create new demo record
  const { data: demo, error } = await adminClient
    .from('ringbooker_demos')
    .insert({
      lead_id: leadId,
      salon_name: payload.salonName,
      demo_vertical: payload.demoVertical,
      demo_config: payload,
      demo_url: result.demoUrl,
      // [FUTURE] rb_request_id: result.requestId,
      // [FUTURE] rb_session_id: result.sessionId,
      status: 'prepared',
      expires_at: result.expiresAt,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to save demo: ${error.message}`)

  // Log outreach event
  await adminClient
    .from('outreach_events')
    .insert({
      lead_id: leadId,
      demo_id: demo.id,
      type: 'demo_created',
      notes: `Demo URL created for ${payload.salonName}`,
      created_by: createdBy,
    })

  return demo.id
}

// ─── Main createDemo function ──────────────────────────────────────────────

export async function createDemo(
  leadId: string,
  createdBy: string | null,
  options?: { notes?: string }
): Promise<{ demoId: string; demoUrl: string }> {
  const adminClient = createAdminClient()

  // Load lead
  const { data: lead, error: leadError } = await adminClient
    .from('salon_leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadId}`)
  }

  // Build payload
  const payload = buildDemoPayload(lead, options)

  // Call RingBooker API (or stub)
  const result = await callRingBookerDemoAPI(payload)

  // Save to DB
  const demoId = await saveDemoRecord(leadId, payload, result, createdBy)

  // Update lead status to outreach_ready if still in scored state
  await adminClient
    .from('salon_leads')
    .update({ status: 'outreach_ready' })
    .eq('id', leadId)
    .in('status', ['scored', 'enriched'])

  return { demoId, demoUrl: result.demoUrl }
}
```

---

## 2. Auto Demo Job Handler

File: `src/lib/jobs/handlers/auto-demo.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createDemo } from '@/lib/demo/demo-service'

export type AutoCreateDemoPayload = {
  leadId: string
}

export async function handleAutoCreateDemo(
  payload: AutoCreateDemoPayload
): Promise<void> {
  const { leadId } = payload
  const adminClient = createAdminClient()

  // Check: lead exists + is priority 1
  const { data: lead } = await adminClient
    .from('salon_leads')
    .select('id, name, status')
    .eq('id', leadId)
    .single()

  if (!lead) {
    console.warn(`[AutoDemo] Lead not found: ${leadId}`)
    return
  }

  // Check priority from score
  const { data: score } = await adminClient
    .from('lead_scores')
    .select('priority')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!score || score.priority !== 1) {
    console.log(`[AutoDemo] Skipping ${leadId} — not priority 1`)
    return
  }

  // Check: demo doesn't already exist
  const { data: existingDemo } = await adminClient
    .from('ringbooker_demos')
    .select('id')
    .eq('lead_id', leadId)
    .single()

  if (existingDemo) {
    console.log(`[AutoDemo] Demo already exists for ${leadId}`)
    return
  }

  // Create demo (system-created, no user)
  await createDemo(leadId, null, {
    notes: 'Auto-created for Priority 1 lead',
  })

  console.log(`[AutoDemo] Demo created for ${lead.name} (${leadId})`)
}
```

**Add to job type list in `011_jobs.sql`:**
```sql
-- Update jobs.type CHECK to include auto_create_demo
ALTER TABLE jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
  CHECK (type IN (
    'search_run', 'enrich_lead', 'enrich_instagram',
    'score_lead', 'score_batch', 'auto_create_demo', 'cleanup'
  ));
```

**Trigger from score handler** — add to end of `src/lib/jobs/handlers/score.ts`:

```typescript
// After scoring completes, auto-queue demo creation for priority 1
if (result.priority === 1) {
  await enqueueJob('auto_create_demo', { leadId }, {
    dedupeKey: `auto_demo_${leadId}`,
  })
}
```

**Add to worker switch** in `scripts/worker.ts`:

```typescript
case 'auto_create_demo':
  await handleAutoCreateDemo(job.payload as any)
  break
```

---

## 3. Demo API Routes

### `src/app/api/leads/[id]/demo/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { createDemo } from '@/lib/demo/demo-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const createDemoSchema = z.object({
  notes: z.string().max(500).optional(),
})

// GET — fetch existing demo for lead
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile } = await getSessionUser()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const adminClient = createAdminClient()

  const { data: demos } = await adminClient
    .from('ringbooker_demos')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ data: demos ?? [] })
}

// POST — create new demo (manual trigger)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Outreacher can only build demo for assigned leads
  if (profile.role !== 'admin') {
    const adminClient = createAdminClient()
    const { data: lead } = await adminClient
      .from('salon_leads')
      .select('assigned_to')
      .eq('id', id)
      .single()

    if (!lead || lead.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => ({}))
  const parsed = createDemoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    const result = await createDemo(id, user.id, parsed.data)
    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create demo' },
      { status: 500 }
    )
  }
}
```

### `src/app/api/demos/bulk/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { enqueueJob } from '@/lib/jobs/queue'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const bulkSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(50),
})

export async function POST(request: NextRequest) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const queued: string[] = []
  const skipped: string[] = []

  for (const leadId of parsed.data.leadIds) {
    // Check demo doesn't already exist
    const { data: existing } = await adminClient
      .from('ringbooker_demos')
      .select('id')
      .eq('lead_id', leadId)
      .single()

    if (existing) {
      skipped.push(leadId)
      continue
    }

    await enqueueJob('auto_create_demo', { leadId }, {
      dedupeKey: `manual_demo_${leadId}`,
    })
    queued.push(leadId)
  }

  return NextResponse.json({
    data: {
      queued: queued.length,
      skipped: skipped.length,
      total: parsed.data.leadIds.length,
    }
  })
}
```

### `src/app/api/demos/[id]/status/route.ts`

```typescript
// Manual status update (until RingBooker webhook is ready)
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const statusSchema = z.object({
  status: z.enum(['shared', 'viewed', 'completed']),
  notes: z.string().max(500).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Load demo to get lead_id
  const { data: demo } = await adminClient
    .from('ringbooker_demos')
    .select('id, lead_id, status')
    .eq('id', id)
    .single()

  if (!demo) {
    return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
  }

  const { status, notes } = parsed.data
  const now = new Date().toISOString()

  // Update demo status
  const demoUpdate: Record<string, unknown> = {
    status,
    updated_at: now,
  }

  if (status === 'viewed' && !demo.status.includes('viewed')) {
    demoUpdate.first_viewed_at = now
    demoUpdate.last_viewed_at = now
    demoUpdate.view_count = 1
  }

  if (status === 'shared') {
    demoUpdate.share_count = 1
  }

  await adminClient
    .from('ringbooker_demos')
    .update(demoUpdate)
    .eq('id', id)

  // Map demo status → outreach event type
  const eventTypeMap = {
    shared: 'demo_shared',
    viewed: 'demo_viewed',
    completed: 'demo_completed',
  } as const

  // Log outreach event
  await adminClient
    .from('outreach_events')
    .insert({
      lead_id: demo.lead_id,
      demo_id: id,
      type: eventTypeMap[status],
      notes: notes ?? `Demo marked as ${status}`,
      created_by: user.id,
    })

  // Update lead status accordingly
  const leadStatusMap = {
    shared: 'demo_shared',
    viewed: 'demo_viewed',
    completed: 'demo_completed',
  } as const

  await adminClient
    .from('salon_leads')
    .update({ status: leadStatusMap[status] })
    .eq('id', demo.lead_id)
    .not('status', 'in', '("converted","lost","disqualified")')

  return NextResponse.json({ data: { success: true, status } })
}
```

---

## 4. Demo UI Components

### `src/components/demo/DemoCard.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip, TooltipContent, TooltipTrigger
} from '@/components/ui/tooltip'
import {
  ExternalLink, Copy, Check, Loader2,
  Wand2, Eye, Share2, CheckCircle2, Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { RingbookerDemo } from '@/types'

type Props = {
  leadId: string
  leadName: string
  demo: RingbookerDemo | null
  canBuild: boolean
  onDemoCreated?: (demo: RingbookerDemo) => void
}

const STATUS_CONFIG = {
  prepared:  { label: 'Ready to share', color: 'bg-slate-100 text-slate-600', icon: Clock },
  shared:    { label: 'Shared',         color: 'bg-blue-100 text-blue-700',   icon: Share2 },
  viewed:    { label: 'Viewed',         color: 'bg-violet-100 text-violet-700', icon: Eye },
  completed: { label: 'Completed',      color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  expired:   { label: 'Expired',        color: 'bg-slate-100 text-slate-400', icon: Clock },
}

export function DemoCard({ leadId, leadName, demo, canBuild, onDemoCreated }: Props) {
  const [building, setBuilding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [currentDemo, setCurrentDemo] = useState<RingbookerDemo | null>(demo)

  async function handleBuildDemo() {
    setBuilding(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success('Demo created!')
        // Refresh demo data
        const demoRes = await fetch(`/api/leads/${leadId}/demo`)
        const demoData = await demoRes.json()
        const newDemo = demoData.data?.[0] ?? null
        setCurrentDemo(newDemo)
        if (newDemo) onDemoCreated?.(newDemo)
      }
    } catch {
      toast.error('Failed to create demo')
    } finally {
      setBuilding(false)
    }
  }

  async function handleCopyLink() {
    if (!currentDemo?.demo_url) return
    await navigator.clipboard.writeText(currentDemo.demo_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Demo link copied!')
  }

  async function handleMarkStatus(status: 'shared' | 'viewed' | 'completed') {
    if (!currentDemo) return
    setUpdatingStatus(true)

    try {
      const res = await fetch(`/api/demos/${currentDemo.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
      } else {
        setCurrentDemo(prev => prev ? { ...prev, status } : null)
        toast.success(`Demo marked as ${status}`)
      }
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // No demo yet
  if (!currentDemo) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Demo</h3>
            <p className="text-xs text-slate-400">No demo created yet</p>
          </div>
        </div>

        {canBuild ? (
          <Button
            onClick={handleBuildDemo}
            disabled={building}
            className="w-full gap-2"
            size="sm"
          >
            {building
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Building demo...</>
              : <><Wand2 className="w-4 h-4" /> Build Demo for {leadName}</>
            }
          </Button>
        ) : (
          <p className="text-xs text-slate-400 text-center">
            Demo will be auto-created when lead is scored
          </p>
        )}

        {/* [FUTURE] Note about RingBooker integration */}
        {!process.env.NEXT_PUBLIC_RB_API_CONFIGURED && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mt-3">
            ⚠️ RingBooker API not connected yet — demo URL will be a placeholder
          </p>
        )}
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[currentDemo.status as keyof typeof STATUS_CONFIG]
    ?? STATUS_CONFIG.prepared
  const StatusIcon = statusConfig.icon

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Demo</h3>
            <p className="text-xs text-slate-400">
              Created {formatDistanceToNow(new Date(currentDemo.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${statusConfig.color}`}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </span>
      </div>

      {/* Demo URL */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-slate-500">Demo link</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-700 font-mono truncate flex-1">
            {currentDemo.demo_url}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopyLink}
                >
                  {copied
                    ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                    : <Copy className="w-3.5 h-3.5" />
                  }
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy link</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  asChild
                >
                  <a href={currentDemo.demo_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open demo</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Manual status tracking */}
      {/* [FUTURE] Replace with auto-tracking from RingBooker webhook */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Track progress</p>
        <div className="grid grid-cols-3 gap-2">
          <TrackButton
            label="Mark Shared"
            icon={Share2}
            done={['shared', 'viewed', 'completed'].includes(currentDemo.status)}
            disabled={updatingStatus || currentDemo.status !== 'prepared'}
            onClick={() => handleMarkStatus('shared')}
          />
          <TrackButton
            label="Mark Viewed"
            icon={Eye}
            done={['viewed', 'completed'].includes(currentDemo.status)}
            disabled={updatingStatus || !['shared', 'prepared'].includes(currentDemo.status)}
            onClick={() => handleMarkStatus('viewed')}
          />
          <TrackButton
            label="Completed"
            icon={CheckCircle2}
            done={currentDemo.status === 'completed'}
            disabled={updatingStatus || currentDemo.status === 'completed'}
            onClick={() => handleMarkStatus('completed')}
          />
        </div>
        <p className="text-xs text-slate-400">
          Manual tracking until RingBooker integration is live
        </p>
      </div>

      {/* Stats */}
      {(currentDemo.share_count > 0 || currentDemo.view_count > 0) && (
        <div className="flex gap-4 pt-1 border-t border-slate-100">
          <span className="text-xs text-slate-500">
            Shared <span className="font-medium text-slate-700">{currentDemo.share_count}x</span>
          </span>
          <span className="text-xs text-slate-500">
            Viewed <span className="font-medium text-slate-700">{currentDemo.view_count}x</span>
          </span>
          {currentDemo.first_viewed_at && (
            <span className="text-xs text-slate-500">
              First viewed{' '}
              <span className="font-medium text-slate-700">
                {formatDistanceToNow(new Date(currentDemo.first_viewed_at), { addSuffix: true })}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function TrackButton({
  label, icon: Icon, done, disabled, onClick
}: {
  label: string
  icon: React.ElementType
  done: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || done}
      className={`
        flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium
        transition-colors
        ${done
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : disabled
          ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
          : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50'
        }
      `}
    >
      {done
        ? <Check className="w-3.5 h-3.5" />
        : <Icon className="w-3.5 h-3.5" />
      }
      {label}
    </button>
  )
}
```

---

## 5. Admin Demos Dashboard

### `src/app/(dashboard)/demos/page.tsx`

```tsx
import { requireRole } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { DemosPageClient } from './DemosPageClient'

export default async function DemosPage() {
  await requireRole('admin')
  const supabase = await createClient()

  // Leads needing demo (priority 1, no demo yet)
  const { data: needsDemoLeads } = await supabase
    .from('salon_leads')
    .select(`
      id, name, city, state, status,
      lead_scores(score, priority, tier, tier_platform),
      assigned_to
    `)
    .eq('status', 'scored')
    .not('id', 'in', `(
      SELECT lead_id FROM ringbooker_demos WHERE status != 'expired'
    )`)
    .order('created_at', { ascending: false })
    .limit(50)

  // Recent demos
  const { data: recentDemos } = await supabase
    .from('ringbooker_demos')
    .select(`
      *,
      salon_leads(id, name, city, state, assigned_to)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <DemosPageClient
      needsDemoLeads={needsDemoLeads ?? []}
      recentDemos={recentDemos ?? []}
    />
  )
}
```

### `src/app/(dashboard)/demos/DemosPageClient.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreBadge } from '@/components/leads/ScoreBadge'
import { TierBadge } from '@/components/leads/TierBadge'
import { Wand2, Loader2, CheckCircle2, Clock, Eye, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

export function DemosPageClient({ needsDemoLeads, recentDemos }: {
  needsDemoLeads: any[]
  recentDemos: any[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [building, setBuilding] = useState(false)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(needsDemoLeads.map(l => l.id)))
  }

  async function handleBulkBuild() {
    if (selected.size === 0) return
    setBuilding(true)

    try {
      const res = await fetch('/api/demos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(
          `Building ${data.data.queued} demos — check back in a moment`
        )
        setSelected(new Set())
      }
    } catch {
      toast.error('Failed to queue demos')
    } finally {
      setBuilding(false)
    }
  }

  const STATUS_ICONS = {
    prepared:  <Clock className="w-3.5 h-3.5 text-slate-400" />,
    shared:    <Share2 className="w-3.5 h-3.5 text-blue-500" />,
    viewed:    <Eye className="w-3.5 h-3.5 text-violet-500" />,
    completed: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Demos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Build and track personalized demos for each salon
          </p>
        </div>
      </div>

      {/* Needs demo section */}
      {needsDemoLeads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Needs demo ({needsDemoLeads.length})
            </h2>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button
                  size="sm"
                  onClick={handleBulkBuild}
                  disabled={building}
                  className="gap-2"
                >
                  {building
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Wand2 className="w-3.5 h-3.5" />
                  }
                  Build demos ({selected.size})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="text-xs"
              >
                Select all
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {needsDemoLeads.map((lead, index) => {
              const score = lead.lead_scores?.[0]
              const isSelected = selected.has(lead.id)

              return (
                <div
                  key={lead.id}
                  className={`
                    flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                    ${isSelected ? 'bg-violet-50' : 'hover:bg-slate-50'}
                    ${index < needsDemoLeads.length - 1 ? 'border-b border-slate-100' : ''}
                  `}
                  onClick={() => toggleSelect(lead.id)}
                >
                  {/* Checkbox */}
                  <div className={`
                    w-4 h-4 rounded border-2 flex items-center justify-center shrink-0
                    ${isSelected
                      ? 'bg-violet-600 border-violet-600'
                      : 'border-slate-300'
                    }
                  `}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L5 8L2 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{lead.name}</p>
                    <p className="text-xs text-slate-400">{lead.city}, {lead.state}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {score && (
                      <>
                        <ScoreBadge score={score.score} priority={score.priority} size="sm" />
                        <TierBadge tier={score.tier} platform={score.tier_platform} size="sm" />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent demos */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Recent demos ({recentDemos.length})
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {recentDemos.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No demos created yet
            </div>
          ) : (
            recentDemos.map((demo, index) => (
              <a
                key={demo.id}
                href={`/leads/${demo.salon_leads?.id}`}
                className={`
                  flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors
                  ${index < recentDemos.length - 1 ? 'border-b border-slate-100' : ''}
                `}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {demo.salon_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {demo.salon_leads?.city}, {demo.salon_leads?.state}
                    {' · '}
                    {formatDistanceToNow(new Date(demo.created_at), { addSuffix: true })}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {STATUS_ICONS[demo.status as keyof typeof STATUS_ICONS]}
                  <span className="text-xs text-slate-500 capitalize">{demo.status}</span>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## 6. Add to Sidebar Navigation

Add "Demos" to sidebar (admin only):

```tsx
// In src/components/layout/Sidebar.tsx
// Add after Analytics:
{
  href: '/demos',
  label: 'Demos',
  icon: Wand2,
  adminOnly: true,
}
```

---

## 7. [FUTURE] Webhook Stub

File: `src/app/api/webhooks/ringbooker/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

// [FUTURE] This endpoint will receive demo events from RingBooker
// When a prospect views/completes the demo on ringbooker.com,
// RingBooker will POST events here to auto-update demo status
//
// Expected events:
// - demo_viewed: prospect opened demo page
// - demo_completed: prospect completed AI conversation
// - demo_missed: prospect left without completing
//
// Security: verify HMAC signature from RingBooker
// Header: X-RingBooker-Signature: hmac-sha256=...

export async function POST(request: NextRequest) {
  // [FUTURE] Implement:
  // 1. Verify HMAC signature
  // 2. Parse event payload
  // 3. Find demo by requestId/sessionId
  // 4. Update ringbooker_demos.status
  // 5. Create outreach_event
  // 6. Update salon_leads.status

  return NextResponse.json(
    { message: 'Webhook endpoint ready — RingBooker integration pending' },
    { status: 200 }
  )
}
```

---

## Definition of Done

- [ ] `demo-service.ts` builds payload from lead data
- [ ] Stub URL generated when `RINGBOOKER_INTERNAL_API_URL` not set
- [ ] `auto_create_demo` job queued when priority 1 lead scored
- [ ] `POST /api/leads/[id]/demo` creates demo (single, manual)
- [ ] `POST /api/demos/bulk` queues bulk demo creation (admin)
- [ ] `PATCH /api/demos/[id]/status` updates shared/viewed/completed
- [ ] `DemoCard` shows URL + copy button + track buttons
- [ ] `/demos` admin page shows needs-demo + recent demos
- [ ] Bulk select + build demos UI works
- [ ] `[FUTURE]` webhook stub in place at correct route
- [ ] Outreach event logged for each demo status change
- [ ] Warning shown in UI when RingBooker API not configured
