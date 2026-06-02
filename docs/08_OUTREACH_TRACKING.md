# 08 — Outreach Tracking
> Depends on: 07_DEMO_SERVICE.md
> Track DM sent → demo shared → replied → converted
> Evidence upload (screenshots), follow-up scheduling, timeline view

---

## Overview

```
Outreacher workflow:
  1. Get assigned lead
  2. Copy demo URL
  3. Send DM on Instagram → log "dm_sent" + upload screenshot
  4. Share demo link → log "demo_shared"
  5. Prospect replies → log "reply_received" + upload screenshot
  6. Mark demo viewed/completed
  7. Schedule follow-up
  8. Mark converted or lost

Admin sees full timeline of every lead across entire team
```

---

## 1. Outreach Service

File: `src/lib/outreach/outreach-service.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadStatus, OutreachEventType } from '@/types'

// Map outreach event → new lead status
const EVENT_TO_STATUS: Partial<Record<OutreachEventType, LeadStatus>> = {
  dm_sent:          'dm_sent',
  email_sent:       'dm_sent',
  demo_shared:      'demo_shared',
  demo_viewed:      'demo_viewed',
  demo_completed:   'demo_completed',
  reply_received:   'replied',
  converted:        'converted',
  lost:             'lost',
  disqualified:     'disqualified',
}

// Only allow forward status transitions
const STATUS_ORDER: LeadStatus[] = [
  'new', 'enriching', 'enriched', 'scored', 'outreach_ready',
  'dm_sent', 'replied', 'demo_shared', 'demo_viewed', 'demo_completed',
  'follow_up_needed', 'converted', 'lost', 'disqualified',
]

function canTransition(current: LeadStatus, next: LeadStatus): boolean {
  // Terminal states cannot transition
  if (['converted', 'lost', 'disqualified'].includes(current)) return false
  // Allow backwards only to follow_up_needed
  if (next === 'follow_up_needed') return true
  // Otherwise only forward
  const currentIdx = STATUS_ORDER.indexOf(current)
  const nextIdx = STATUS_ORDER.indexOf(next)
  return nextIdx > currentIdx
}

export type LogEventInput = {
  leadId: string
  type: OutreachEventType
  channel?: string
  notes?: string
  demoId?: string
  metadata?: Record<string, unknown>
  createdBy: string
}

export async function logOutreachEvent(input: LogEventInput): Promise<string> {
  const adminClient = createAdminClient()

  // Load current lead status
  const { data: lead } = await adminClient
    .from('salon_leads')
    .select('id, status')
    .eq('id', input.leadId)
    .single()

  if (!lead) throw new Error(`Lead not found: ${input.leadId}`)

  const prevStatus = lead.status as LeadStatus
  const newStatus = EVENT_TO_STATUS[input.type]

  // Log event
  const { data: event, error } = await adminClient
    .from('outreach_events')
    .insert({
      lead_id: input.leadId,
      demo_id: input.demoId ?? null,
      type: input.type,
      channel: input.channel ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      prev_status: prevStatus,
      new_status: newStatus ?? null,
      created_by: input.createdBy,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to log event: ${error.message}`)

  // Update lead status if applicable
  if (newStatus && canTransition(prevStatus, newStatus)) {
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    if (newStatus === 'dm_sent' || newStatus === 'replied' || newStatus === 'demo_shared') {
      updates.last_outreach_at = new Date().toISOString()
    }
    if (newStatus === 'converted') {
      updates.converted_at = new Date().toISOString()
    }

    await adminClient
      .from('salon_leads')
      .update(updates)
      .eq('id', input.leadId)
  }

  return event.id
}

export async function scheduleFollowUp(input: {
  leadId: string
  assignedTo: string
  scheduledFor: Date
  type: string
  notes?: string
  createdBy: string
}): Promise<string> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('follow_ups')
    .insert({
      lead_id: input.leadId,
      assigned_to: input.assignedTo,
      scheduled_for: input.scheduledFor.toISOString(),
      type: input.type,
      notes: input.notes,
      status: 'pending',
      created_by: input.createdBy,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to schedule follow-up: ${error.message}`)

  // Update lead status to follow_up_needed
  await adminClient
    .from('salon_leads')
    .update({ status: 'follow_up_needed' })
    .eq('id', input.leadId)
    .not('status', 'in', '("converted","lost","disqualified")')

  return data.id
}

export async function completeFollowUp(
  followUpId: string,
  outcome: string,
  completedBy: string
): Promise<void> {
  const adminClient = createAdminClient()

  await adminClient
    .from('follow_ups')
    .update({
      status: 'completed',
      outcome,
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', followUpId)
}
```

---

## 2. Evidence Upload Service

File: `src/lib/outreach/evidence-service.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type EvidenceType =
  | 'dm_screenshot'
  | 'reply_screenshot'
  | 'demo_shared_screenshot'
  | 'demo_viewed_confirm'
  | 'converted_proof'
  | 'other'

export type UploadEvidenceInput = {
  leadId: string
  eventId: string
  type: EvidenceType
  file: File
  notes?: string
  uploadedBy: string
}

export async function uploadEvidence(input: UploadEvidenceInput): Promise<{
  evidenceId: string
  storagePath: string
  publicUrl: string
}> {
  const adminClient = createAdminClient()

  // Validate file
  const MAX_SIZE = 10 * 1024 * 1024  // 10MB
  if (input.file.size > MAX_SIZE) {
    throw new Error('File too large (max 10MB)')
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!ALLOWED_TYPES.includes(input.file.type)) {
    throw new Error('Only images allowed (JPEG, PNG, WebP, GIF)')
  }

  // Build storage path: {userId}/{leadId}/{timestamp}-{type}.ext
  const ext = input.file.type.split('/')[1]
  const timestamp = Date.now()
  const storagePath = `${input.uploadedBy}/${input.leadId}/${timestamp}-${input.type}.${ext}`

  // Upload to Supabase Storage
  const arrayBuffer = await input.file.arrayBuffer()
  const { error: uploadError } = await adminClient.storage
    .from('evidence')
    .upload(storagePath, arrayBuffer, {
      contentType: input.file.type,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  // Get signed URL (private bucket — 7 day expiry)
  const { data: signedData } = await adminClient.storage
    .from('evidence')
    .createSignedUrl(storagePath, 7 * 24 * 60 * 60)

  const publicUrl = signedData?.signedUrl ?? ''

  // Save evidence record
  const { data: evidence, error: dbError } = await adminClient
    .from('outreach_evidence')
    .insert({
      event_id: input.eventId,
      lead_id: input.leadId,
      type: input.type,
      storage_path: storagePath,
      file_name: input.file.name,
      file_size: input.file.size,
      mime_type: input.file.type,
      notes: input.notes,
      uploaded_by: input.uploadedBy,
    })
    .select('id')
    .single()

  if (dbError) throw new Error(`Failed to save evidence: ${dbError.message}`)

  return {
    evidenceId: evidence.id,
    storagePath,
    publicUrl,
  }
}

export async function getEvidenceSignedUrl(
  storagePath: string
): Promise<string | null> {
  const adminClient = createAdminClient()

  const { data } = await adminClient.storage
    .from('evidence')
    .createSignedUrl(storagePath, 60 * 60)  // 1 hour

  return data?.signedUrl ?? null
}
```

---

## 3. Outreach API Routes

### `src/app/api/outreach/[leadId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { logOutreachEvent } from '@/lib/outreach/outreach-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const logEventSchema = z.object({
  type: z.enum([
    'dm_sent', 'email_sent', 'demo_created', 'demo_shared',
    'demo_viewed', 'demo_completed', 'reply_received',
    'follow_up_sent', 'call_completed', 'converted', 'lost',
    'disqualified', 'note', 'status_changed', 'assigned',
  ]),
  channel: z.enum([
    'instagram_dm', 'facebook_dm', 'email', 'whatsapp', 'phone', 'other'
  ]).optional(),
  notes: z.string().max(2000).optional(),
  demoId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
})

// GET — list outreach events for lead
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { leadId } = await params
  const adminClient = createAdminClient()

  // Verify access
  if (profile.role !== 'admin') {
    const { data: lead } = await adminClient
      .from('salon_leads')
      .select('assigned_to')
      .eq('id', leadId)
      .single()

    if (!lead || lead.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: events } = await adminClient
    .from('outreach_events')
    .select(`
      *,
      created_by_profile:profiles!outreach_events_created_by_fkey(full_name, avatar_url),
      outreach_evidence(id, type, storage_path, file_name, notes)
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ data: events ?? [] })
}

// POST — log new outreach event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { leadId } = await params
  const adminClient = createAdminClient()

  // Verify access to this lead
  if (profile.role !== 'admin') {
    const { data: lead } = await adminClient
      .from('salon_leads')
      .select('assigned_to')
      .eq('id', leadId)
      .single()

    if (!lead || lead.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json()
  const parsed = logEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    )
  }

  try {
    const eventId = await logOutreachEvent({
      leadId,
      ...parsed.data,
      createdBy: user.id,
    })

    return NextResponse.json({ data: { eventId } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to log event' },
      { status: 500 }
    )
  }
}
```

### `src/app/api/evidence/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { uploadEvidence } from '@/lib/outreach/evidence-service'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const leadId = formData.get('leadId') as string | null
  const eventId = formData.get('eventId') as string | null
  const type = formData.get('type') as string | null
  const notes = formData.get('notes') as string | null

  if (!file || !leadId || !eventId || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify access
  if (profile.role !== 'admin') {
    const adminClient = createAdminClient()
    const { data: lead } = await adminClient
      .from('salon_leads')
      .select('assigned_to')
      .eq('id', leadId)
      .single()

    if (!lead || lead.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    const result = await uploadEvidence({
      leadId,
      eventId,
      type: type as any,
      file,
      notes: notes ?? undefined,
      uploadedBy: user.id,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
```

### `src/app/api/follow-ups/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { scheduleFollowUp, completeFollowUp } from '@/lib/outreach/outreach-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const createSchema = z.object({
  leadId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  type: z.enum(['dm_followup', 'share_demo', 'check_viewed', 'pricing_call', 'close']),
  notes: z.string().max(500).optional(),
  assignedTo: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'pending'

  let query = adminClient
    .from('follow_ups')
    .select(`
      *,
      salon_leads(id, name, city, state, status),
      assigned_to_profile:profiles!follow_ups_assigned_to_fkey(full_name, avatar_url)
    `)
    .eq('status', status)
    .order('scheduled_for', { ascending: true })

  // Outreacher: only own follow-ups
  if (profile.role !== 'admin') {
    query = query.eq('assigned_to', user.id)
  }

  const { data } = await query.limit(50)
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const { user, profile } = await getSessionUser()
  if (!user || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { leadId, scheduledFor, type, notes, assignedTo } = parsed.data

  try {
    const id = await scheduleFollowUp({
      leadId,
      assignedTo: assignedTo ?? user.id,
      scheduledFor: new Date(scheduledFor),
      type,
      notes,
      createdBy: user.id,
    })
    return NextResponse.json({ data: { id } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
```

---

## 4. Outreach UI Components

### `src/components/outreach/OutreachTimeline.tsx`

```tsx
'use client'

import { formatDistanceToNow, format } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  MessageCircle, Mail, Share2, Eye, CheckCircle2,
  MessageSquare, Phone, TrendingUp, XCircle, StickyNote,
  Wand2, UserPlus, ArrowRight, ImageIcon
} from 'lucide-react'

const EVENT_CONFIG: Record<string, {
  label: string
  icon: React.ElementType
  color: string
}> = {
  dm_sent:          { label: 'DM sent',          icon: MessageCircle, color: 'text-blue-500 bg-blue-50' },
  email_sent:       { label: 'Email sent',        icon: Mail,          color: 'text-indigo-500 bg-indigo-50' },
  demo_created:     { label: 'Demo created',      icon: Wand2,         color: 'text-violet-500 bg-violet-50' },
  demo_shared:      { label: 'Demo shared',       icon: Share2,        color: 'text-violet-500 bg-violet-50' },
  demo_viewed:      { label: 'Demo viewed',       icon: Eye,           color: 'text-cyan-500 bg-cyan-50' },
  demo_completed:   { label: 'Demo completed',    icon: CheckCircle2,  color: 'text-teal-500 bg-teal-50' },
  reply_received:   { label: 'Reply received',    icon: MessageSquare, color: 'text-emerald-500 bg-emerald-50' },
  follow_up_sent:   { label: 'Follow-up sent',    icon: MessageCircle, color: 'text-blue-400 bg-blue-50' },
  call_completed:   { label: 'Call completed',    icon: Phone,         color: 'text-green-500 bg-green-50' },
  converted:        { label: 'Converted! 🎉',     icon: TrendingUp,    color: 'text-emerald-600 bg-emerald-50' },
  lost:             { label: 'Marked lost',       icon: XCircle,       color: 'text-red-400 bg-red-50' },
  disqualified:     { label: 'Disqualified',      icon: XCircle,       color: 'text-slate-400 bg-slate-50' },
  note:             { label: 'Note',              icon: StickyNote,    color: 'text-amber-500 bg-amber-50' },
  status_changed:   { label: 'Status changed',    icon: ArrowRight,    color: 'text-slate-400 bg-slate-50' },
  assigned:         { label: 'Assigned',          icon: UserPlus,      color: 'text-slate-400 bg-slate-50' },
}

type Event = {
  id: string
  type: string
  channel: string | null
  notes: string | null
  created_at: string
  created_by_profile?: { full_name: string | null; avatar_url: string | null } | null
  outreach_evidence?: { id: string; type: string; storage_path: string; file_name: string }[]
}

type Props = {
  events: Event[]
  onAddEvent?: () => void
}

export function OutreachTimeline({ events, onAddEvent }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No outreach activity yet</p>
        {onAddEvent && (
          <button
            onClick={onAddEvent}
            className="text-sm text-violet-600 hover:text-violet-700 mt-2"
          >
            Log first contact →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-100" />

      <div className="space-y-4">
        {events.map(event => {
          const config = EVENT_CONFIG[event.type] ?? {
            label: event.type,
            icon: StickyNote,
            color: 'text-slate-400 bg-slate-50',
          }
          const Icon = config.icon
          const profile = event.created_by_profile

          return (
            <div key={event.id} className="flex gap-3 relative">
              {/* Icon */}
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10
                ${config.color}
              `}>
                <Icon className="w-3.5 h-3.5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-slate-800">
                      {config.label}
                    </span>
                    {event.channel && (
                      <span className="text-xs text-slate-400 ml-1.5">
                        via {event.channel.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </span>
                </div>

                {event.notes && (
                  <p className="text-xs text-slate-600 mt-0.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
                    {event.notes}
                  </p>
                )}

                {/* Evidence screenshots */}
                {event.outreach_evidence && event.outreach_evidence.length > 0 && (
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {event.outreach_evidence.map(ev => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span className="truncate max-w-[120px]">{ev.file_name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actor */}
                {profile && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">
                        {(profile.full_name ?? '?')[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-slate-400">
                      {profile.full_name ?? 'Unknown'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

### `src/components/outreach/LogEventModal.tsx`

```tsx
'use client'

import { useState, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Loader2, Upload, X, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

type EventType = 'dm_sent' | 'reply_received' | 'demo_shared' | 'note' | 'converted' | 'lost'

const EVENT_OPTIONS: { value: EventType; label: string; requiresEvidence: boolean }[] = [
  { value: 'dm_sent',       label: 'DM sent',          requiresEvidence: true  },
  { value: 'reply_received',label: 'Reply received',   requiresEvidence: true  },
  { value: 'demo_shared',   label: 'Demo shared',      requiresEvidence: false },
  { value: 'note',          label: 'Note',             requiresEvidence: false },
  { value: 'converted',     label: 'Converted! 🎉',    requiresEvidence: false },
  { value: 'lost',          label: 'Mark as lost',     requiresEvidence: false },
]

const CHANNEL_OPTIONS = [
  { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'facebook_dm',  label: 'Facebook DM'  },
  { value: 'email',        label: 'Email'         },
  { value: 'whatsapp',     label: 'WhatsApp'      },
  { value: 'phone',        label: 'Phone'         },
]

const EVIDENCE_TYPE_MAP: Record<EventType, string> = {
  dm_sent:        'dm_screenshot',
  reply_received: 'reply_screenshot',
  demo_shared:    'demo_shared_screenshot',
  note:           'other',
  converted:      'converted_proof',
  lost:           'other',
}

type Props = {
  open: boolean
  onClose: () => void
  leadId: string
  onSuccess?: () => void
}

export function LogEventModal({ open, onClose, leadId, onSuccess }: Props) {
  const [eventType, setEventType] = useState<EventType>('dm_sent')
  const [channel, setChannel] = useState('instagram_dm')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedOption = EVENT_OPTIONS.find(o => o.value === eventType)

  async function handleSubmit() {
    setLoading(true)

    try {
      // 1. Log the event
      const eventRes = await fetch(`/api/outreach/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: eventType,
          channel: ['dm_sent', 'reply_received'].includes(eventType) ? channel : undefined,
          notes: notes.trim() || undefined,
        }),
      })

      const eventData = await eventRes.json()
      if (eventData.error) throw new Error(eventData.error)

      const eventId = eventData.data.eventId

      // 2. Upload screenshot if provided
      if (file && eventId) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('leadId', leadId)
        formData.append('eventId', eventId)
        formData.append('type', EVIDENCE_TYPE_MAP[eventType])
        if (notes) formData.append('notes', notes)

        const uploadRes = await fetch('/api/evidence', {
          method: 'POST',
          body: formData,
        })

        const uploadData = await uploadRes.json()
        if (uploadData.error) {
          toast.warning('Event logged but screenshot upload failed')
        }
      }

      toast.success('Logged successfully')
      handleClose()
      onSuccess?.()

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to log event')
    } finally {
      setLoading(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) setFile(selected)
  }

  function handleClose() {
    setEventType('dm_sent')
    setChannel('instagram_dm')
    setNotes('')
    setFile(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log outreach activity</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Event type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">what happened</Label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setEventType(opt.value)}
                  className={`
                    text-left px-3 py-2 rounded-lg border text-sm transition-colors
                    ${eventType === opt.value
                      ? 'bg-violet-50 border-violet-300 text-violet-700 font-medium'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Channel (for DM/reply) */}
          {['dm_sent', 'reply_received', 'demo_shared'].includes(eventType) && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              notes {eventType === 'note' ? '(required)' : '(optional)'}
            </Label>
            <Textarea
              placeholder={
                eventType === 'reply_received'
                  ? "What did they say? e.g. 'Interested, what's the price?'"
                  : eventType === 'dm_sent'
                  ? "Message sent or template used..."
                  : eventType === 'lost'
                  ? "Why did they decline?"
                  : "Add a note..."
              }
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Screenshot upload */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              screenshot
              {selectedOption?.requiresEvidence ? ' (recommended)' : ' (optional)'}
            </Label>

            {file ? (
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-600 truncate flex-1">{file.name}</span>
                <button
                  onClick={() => setFile(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:border-violet-300 hover:text-violet-600 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload screenshot
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
              capture="environment"  // Opens camera on mobile
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={loading || (eventType === 'note' && !notes.trim())}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Log activity
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### `src/components/outreach/FollowUpCard.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Clock, CheckCircle2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays, isAfter } from 'date-fns'

type FollowUp = {
  id: string
  scheduled_for: string
  type: string
  notes: string | null
  status: string
}

type Props = {
  leadId: string
  followUps: FollowUp[]
  onUpdate?: () => void
}

const FOLLOWUP_TYPES = [
  { value: 'dm_followup',   label: 'DM follow-up'     },
  { value: 'share_demo',    label: 'Share demo'        },
  { value: 'check_viewed',  label: 'Check if viewed'   },
  { value: 'pricing_call',  label: 'Pricing call'      },
  { value: 'close',         label: 'Close deal'        },
]

export function FollowUpCard({ leadId, followUps, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('dm_followup')
  const [date, setDate] = useState(format(addDays(new Date(), 3), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const pending = followUps.filter(f => f.status === 'pending')
  const overdue = pending.filter(f => isAfter(new Date(), new Date(f.scheduled_for)))

  async function handleCreate() {
    setLoading(true)
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          scheduledFor: new Date(date).toISOString(),
          type,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      toast.success('Follow-up scheduled')
      setShowForm(false)
      setNotes('')
      onUpdate?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Follow-ups</h3>
          {overdue.length > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
              {overdue.length} overdue
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Schedule
        </Button>
      </div>

      {/* Schedule form */}
      {showForm && (
        <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">date</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-8 text-xs"
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          </div>
          <Textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="text-xs resize-none"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              Schedule
            </Button>
          </div>
        </div>
      )}

      {/* Follow-ups list */}
      {pending.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400 text-center py-2">No follow-ups scheduled</p>
      ) : (
        <div className="space-y-2">
          {pending.map(fu => {
            const isOverdue = isAfter(new Date(), new Date(fu.scheduled_for))
            const typeLabel = FOLLOWUP_TYPES.find(t => t.value === fu.type)?.label ?? fu.type

            return (
              <div
                key={fu.id}
                className={`flex items-center gap-2 p-2 rounded-lg ${
                  isOverdue ? 'bg-red-50 border border-red-100' : 'bg-slate-50'
                }`}
              >
                <Clock className={`w-3.5 h-3.5 shrink-0 ${isOverdue ? 'text-red-400' : 'text-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700">{typeLabel}</p>
                  <p className={`text-xs ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                    {isOverdue ? 'Overdue · ' : ''}
                    {format(new Date(fu.scheduled_for), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

---

## 5. Status Badge Component

### `src/components/leads/StatusBadge.tsx`

```tsx
import type { LeadStatus } from '@/types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:               { label: 'New',            color: 'bg-slate-100 text-slate-500'     },
  enriching:         { label: 'Enriching...',   color: 'bg-blue-50 text-blue-500'        },
  enriched:          { label: 'Enriched',       color: 'bg-blue-100 text-blue-600'       },
  scored:            { label: 'Scored',         color: 'bg-violet-50 text-violet-600'    },
  outreach_ready:    { label: 'Ready',          color: 'bg-violet-100 text-violet-700'   },
  dm_sent:           { label: 'DM Sent',        color: 'bg-blue-100 text-blue-700'       },
  replied:           { label: 'Replied',        color: 'bg-indigo-100 text-indigo-700'   },
  demo_shared:       { label: 'Demo Shared',    color: 'bg-violet-100 text-violet-700'   },
  demo_viewed:       { label: 'Demo Viewed',    color: 'bg-cyan-100 text-cyan-700'       },
  demo_completed:    { label: 'Demo Done',      color: 'bg-teal-100 text-teal-700'       },
  follow_up_needed:  { label: 'Follow Up',      color: 'bg-amber-100 text-amber-700'     },
  converted:         { label: 'Converted ✓',    color: 'bg-emerald-100 text-emerald-700' },
  lost:              { label: 'Lost',           color: 'bg-red-100 text-red-500'         },
  disqualified:      { label: 'Disqualified',   color: 'bg-slate-100 text-slate-400'     },
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: 'bg-slate-100 text-slate-500',
  }

  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
      ${config.color}
    `}>
      {config.label}
    </span>
  )
}
```

---

## Definition of Done

- [ ] `logOutreachEvent` updates lead status correctly (forward only)
- [ ] `uploadEvidence` saves file to Supabase Storage private bucket
- [ ] Evidence files get signed URL (not public URL)
- [ ] `POST /api/outreach/[leadId]` logs event + updates lead status
- [ ] `POST /api/evidence` handles file upload (max 10MB, images only)
- [ ] `POST /api/follow-ups` schedules follow-up + sets follow_up_needed status
- [ ] `OutreachTimeline` renders all event types with correct icons
- [ ] `LogEventModal` opens camera on mobile (`capture="environment"`)
- [ ] Screenshot upload works from mobile phone gallery
- [ ] `FollowUpCard` shows overdue follow-ups in red
- [ ] `StatusBadge` shows correct color for each status
- [ ] Outreacher cannot log events for leads not assigned to them
- [ ] Converted/lost leads cannot be further status-updated
