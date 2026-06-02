# 10 — UI Dashboard
> Full UI spec: layout, all pages, mobile-first, modern SaaS aesthetic

---

## Design Principles

- **Mobile-first**: every view works on 375px iPhone screen
- **Data-dense but readable**: show key info at a glance
- **Minimal clicks**: most common actions available without navigation
- **Progressive disclosure**: detail on tap/click, not overwhelming upfront
- **Consistent patterns**: same card layout, same badge colors everywhere

---

## 1. Layout

### `src/app/(dashboard)/layout.tsx`

```tsx
import { requireAuth } from '@/lib/auth/helpers'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'
import { Toaster } from 'sonner'

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const profile = await requireAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <Sidebar profile={profile} className="hidden lg:flex" />

      {/* Main content */}
      <div className="lg:pl-60">
        <TopBar profile={profile} />
        <main className="px-4 py-6 lg:px-8 max-w-7xl mx-auto pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav profile={profile} className="lg:hidden" />

      <Toaster position="top-right" richColors />
    </div>
  )
}
```

### `src/components/layout/Sidebar.tsx`

```tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Search, Users, BarChart3,
  Wand2, LogOut, Settings
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Profile } from '@/types'

const NAV_ITEMS = [
  { href: '/',          label: 'Pipeline',   icon: LayoutDashboard, adminOnly: false },
  { href: '/leads',     label: 'Leads',      icon: Users,           adminOnly: false },
  { href: '/demos',     label: 'Demos',      icon: Wand2,           adminOnly: true  },
  { href: '/search',    label: 'Search',     icon: Search,          adminOnly: true  },
  { href: '/analytics', label: 'Analytics',  icon: BarChart3,       adminOnly: true  },
  { href: '/team',      label: 'Team',       icon: Settings,        adminOnly: true  },
]

export function Sidebar({ profile, className }: { profile: Profile; className?: string }) {
  return (
    <aside className={`
      fixed inset-y-0 left-0 w-60 bg-white border-r border-slate-200
      flex flex-col z-30 ${className}
    `}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">R</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">RingBooker</p>
            <p className="text-xs text-slate-400">Sales</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => {
          if (item.adminOnly && profile.role !== 'admin') return null
          return <NavItem key={item.href} {...item} />
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar className="w-7 h-7">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="bg-violet-100 text-violet-700 text-xs">
              {(profile.full_name ?? profile.email)[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-800 truncate">
              {profile.full_name ?? profile.email}
            </p>
            <p className="text-xs text-slate-400 capitalize">{profile.role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ href, label, icon: Icon }: typeof NAV_ITEMS[0]) {
  // Note: use 'use client' and usePathname for active state
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                 text-slate-600 hover:bg-slate-50 hover:text-slate-900
                 transition-colors group"
    >
      <Icon className="w-4 h-4 group-hover:text-violet-600" />
      {label}
    </Link>
  )
}
```

### `src/components/layout/MobileNav.tsx`

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Wand2, Search, BarChart3 } from 'lucide-react'
import type { Profile } from '@/types'

const MOBILE_NAV = [
  { href: '/',          label: 'Pipeline', icon: LayoutDashboard, adminOnly: false },
  { href: '/leads',     label: 'Leads',    icon: Users,           adminOnly: false },
  { href: '/demos',     label: 'Demos',    icon: Wand2,           adminOnly: true  },
  { href: '/search',    label: 'Search',   icon: Search,          adminOnly: true  },
  { href: '/analytics', label: 'Stats',    icon: BarChart3,       adminOnly: true  },
]

export function MobileNav({ profile, className }: { profile: Profile; className?: string }) {
  const pathname = usePathname()

  const items = MOBILE_NAV.filter(i => !i.adminOnly || profile.role === 'admin')

  return (
    <nav className={`
      fixed bottom-0 inset-x-0 bg-white border-t border-slate-200
      flex items-center justify-around px-2 pb-safe z-30 ${className}
    `}>
      {items.map(item => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-4 py-3 ${
              active ? 'text-violet-600' : 'text-slate-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

---

## 2. Pipeline Page (Home)

### `src/app/(dashboard)/page.tsx`

```tsx
import { requireAuth } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PipelineClient } from './PipelineClient'

export default async function PipelinePage() {
  const profile = await requireAuth()
  const supabase = await createClient()

  // Build query based on role
  let query = supabase
    .from('salon_leads')
    .select(`
      id, name, city, state, status, last_outreach_at, assigned_to, updated_at,
      lead_scores(score, priority, tier, tier_platform),
      ringbooker_demos(id, status, demo_url),
      assigned_to_profile:profiles!salon_leads_assigned_to_fkey(full_name, avatar_url),
      follow_ups(id, scheduled_for, status, type)
    `)
    .not('status', 'in', '("new","enriching","enriched","disqualified")')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (profile.role !== 'admin') {
    query = query.eq('assigned_to', profile.id)
  }

  const { data: leads } = await query

  // Overdue follow-ups
  const { data: overdueFollowUps } = await supabase
    .from('follow_ups')
    .select('*, salon_leads(id, name)')
    .eq('status', 'pending')
    .lt('scheduled_for', new Date().toISOString())
    .eq(profile.role === 'admin' ? 'status' : 'assigned_to',
        profile.role === 'admin' ? 'pending' : profile.id)
    .limit(10)

  return (
    <PipelineClient
      leads={leads ?? []}
      overdueFollowUps={overdueFollowUps ?? []}
      isAdmin={profile.role === 'admin'}
    />
  )
}
```

### `src/app/(dashboard)/PipelineClient.tsx`

```tsx
'use client'

import { useState } from 'react'
import { StatusBadge } from '@/components/leads/StatusBadge'
import { ScoreBadge } from '@/components/leads/ScoreBadge'
import { TierBadge } from '@/components/leads/TierBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Clock, AlertTriangle, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import type { LeadStatus } from '@/types'

const PIPELINE_COLUMNS: { status: LeadStatus; label: string; color: string }[] = [
  { status: 'outreach_ready',  label: 'Ready to DM',    color: 'border-violet-200' },
  { status: 'dm_sent',         label: 'DM Sent',        color: 'border-blue-200'   },
  { status: 'replied',         label: 'Replied',        color: 'border-indigo-200' },
  { status: 'demo_shared',     label: 'Demo Shared',    color: 'border-violet-200' },
  { status: 'demo_viewed',     label: 'Demo Viewed',    color: 'border-cyan-200'   },
  { status: 'demo_completed',  label: 'Demo Done',      color: 'border-teal-200'   },
  { status: 'follow_up_needed',label: 'Follow Up',      color: 'border-amber-200'  },
  { status: 'converted',       label: 'Converted ✓',    color: 'border-emerald-200'},
]

export function PipelineClient({ leads, overdueFollowUps, isAdmin }: {
  leads: any[]
  overdueFollowUps: any[]
  isAdmin: boolean
}) {
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  const byStatus = PIPELINE_COLUMNS.reduce((acc, col) => {
    acc[col.status] = leads.filter(l => l.status === col.status)
    return acc
  }, {} as Record<string, any[]>)

  const totalActive = leads.filter(l =>
    !['converted', 'lost', 'disqualified'].includes(l.status)
  ).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalActive} active leads
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {(['kanban', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                view === v
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Overdue alerts */}
      {overdueFollowUps.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-700 text-sm">
            {overdueFollowUps.length} overdue follow-up{overdueFollowUps.length > 1 ? 's' : ''}.{' '}
            {overdueFollowUps.slice(0, 2).map(f => f.salon_leads?.name).join(', ')}
            {overdueFollowUps.length > 2 && ` +${overdueFollowUps.length - 2} more`}
          </AlertDescription>
        </Alert>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {PIPELINE_COLUMNS.map(col => {
              const colLeads = byStatus[col.status] ?? []
              return (
                <div key={col.status} className="w-64 shrink-0">
                  <div className={`
                    flex items-center justify-between mb-2 px-1
                  `}>
                    <span className="text-xs font-semibold text-slate-600">{col.label}</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                      {colLeads.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {colLeads.map(lead => (
                      <PipelineCard key={lead.id} lead={lead} />
                    ))}

                    {colLeads.length === 0 && (
                      <div className="text-center py-6 text-slate-300 text-xs border border-dashed border-slate-200 rounded-xl">
                        Empty
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {leads.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No leads in pipeline yet
            </div>
          ) : (
            leads.map((lead, index) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${
                  index < leads.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{lead.name}</p>
                  <p className="text-xs text-slate-400">{lead.city}, {lead.state}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={lead.status} />
                  {lead.lead_scores?.[0] && (
                    <ScoreBadge
                      score={lead.lead_scores[0].score}
                      priority={lead.lead_scores[0].priority}
                      size="sm"
                    />
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function PipelineCard({ lead }: { lead: any }) {
  const score = lead.lead_scores?.[0]
  const demo = lead.ringbooker_demos?.[0]

  return (
    <Link href={`/leads/${lead.id}`}>
      <div className="bg-white border border-slate-200 rounded-xl p-3 hover:border-violet-200 hover:shadow-sm transition-all">
        <p className="text-sm font-medium text-slate-900 truncate mb-1">{lead.name}</p>
        <p className="text-xs text-slate-400 mb-2">{lead.city}, {lead.state}</p>

        <div className="flex items-center gap-1.5 flex-wrap">
          {score && (
            <ScoreBadge score={score.score} priority={score.priority} size="sm" />
          )}
          {score?.tier && (
            <TierBadge tier={score.tier} platform={score.tier_platform} size="sm" />
          )}
        </div>

        {lead.last_outreach_at && (
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(lead.last_outreach_at), { addSuffix: true })}
          </p>
        )}
      </div>
    </Link>
  )
}
```

---

## 3. Lead List Page

### `src/app/(dashboard)/leads/page.tsx`

```tsx
import { requireAuth } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { LeadListClient } from './LeadListClient'

export default async function LeadsPage() {
  const profile = await requireAuth()
  const supabase = await createClient()

  // Load initial data (page 1, no filters)
  let query = supabase
    .from('salon_leads')
    .select(`
      id, name, city, state, phone, website_url, instagram_url,
      rating, review_count, status, assigned_to, created_at,
      lead_scores(score, priority, tier, tier_platform),
      ringbooker_demos(id, status)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50)

  if (profile.role !== 'admin') {
    query = query.eq('assigned_to', profile.id)
  }

  const { data: leads, count } = await query

  // Load outreachers for filter (admin only)
  let outreachers: any[] = []
  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
    outreachers = data ?? []
  }

  return (
    <LeadListClient
      initialLeads={leads ?? []}
      total={count ?? 0}
      isAdmin={profile.role === 'admin'}
      outreachers={outreachers}
    />
  )
}
```

### `src/app/(dashboard)/leads/LeadListClient.tsx`

Key features to implement:
- Filter bar: status, priority, tier, city, assignedTo, search
- Sort: score (default), created_at, rating, review_count
- Bulk actions (admin): assign, build demos
- Each row: name, city, score badge, tier badge, status badge, quick actions

---

## 4. Lead Detail Page

### `src/app/(dashboard)/leads/[id]/page.tsx`

```tsx
import { requireAuth } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LeadDetailClient } from './LeadDetailClient'

export default async function LeadDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireAuth()
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('salon_leads')
    .select(`
      *,
      lead_scores(*),
      website_snapshots(*),
      instagram_snapshots(*),
      ringbooker_demos(*),
      follow_ups(*),
      assigned_to_profile:profiles!salon_leads_assigned_to_fkey(id, full_name, avatar_url)
    `)
    .eq('id', id)
    .single()

  if (!lead) notFound()

  // Check access
  if (profile.role !== 'admin' && lead.assigned_to !== profile.id) {
    notFound()
  }

  const { data: events } = await supabase
    .from('outreach_events')
    .select(`
      *,
      created_by_profile:profiles!outreach_events_created_by_fkey(full_name, avatar_url),
      outreach_evidence(id, type, storage_path, file_name)
    `)
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  return (
    <LeadDetailClient
      lead={lead}
      events={events ?? []}
      profile={profile}
    />
  )
}
```

### Lead Detail Layout (tabs)

```
Tab 1: Overview
  - Header: name, city, rating ⭐, review count
  - Score breakdown card
  - Contact info: phone, website, Instagram
  - Hours (highlight: closes before 6PM / no Sunday)
  - Google Maps embed
  - Assigned to + assign button (admin)

Tab 2: Enrichment
  - Website data: platform detected, booking links, CTA
  - Instagram: followers, active?, booking link in bio
  - Re-enrich button (admin)

Tab 3: Demo
  - DemoCard component (build/view/track)

Tab 4: Activity
  - OutreachTimeline
  - LogEventModal trigger
  - FollowUpCard

Tab 5: Notes
  - Free text notes (auto-save)
  - Tags
```

---

## 5. Analytics Page

### `src/app/(dashboard)/analytics/page.tsx`

```tsx
import { requireRole } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { AnalyticsClient } from './AnalyticsClient'

export default async function AnalyticsPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { data: stats } = await supabase.rpc('get_pipeline_stats')

  // Per-member stats
  const { data: memberStats } = await supabase
    .from('salon_leads')
    .select('assigned_to, status, profiles!salon_leads_assigned_to_fkey(full_name)')
    .not('assigned_to', 'is', null)

  // Demo conversion
  const { data: demoStats } = await supabase
    .from('ringbooker_demos')
    .select('status, created_at')

  return <AnalyticsClient stats={stats} memberStats={memberStats ?? []} demoStats={demoStats ?? []} />
}
```

**Key metrics to show:**

```
Row 1 — Top metrics (cards)
  Total leads | Priority 1 leads | Demos created | Converted

Row 2 — Funnel chart
  Scored → Outreach Ready → DM Sent → Replied → Demo Shared → Demo Viewed → Converted

Row 3 — Split
  Left: By city (bar chart)
  Right: By tier A/B/C (donut)

Row 4 — Team table (admin)
  Member | Assigned | DM Sent | Replied | Demo Shared | Converted | Conv Rate
```

---

## 6. Mobile-specific considerations

```typescript
// All touch targets minimum 44x44px
// Bottom sheet instead of dropdown on mobile for filters
// Swipe actions on lead cards (archive, assign)
// Camera capture for screenshot upload
// Sticky bottom action bar on lead detail

// CSS safe area for iPhone notch:
// pb-safe = env(safe-area-inset-bottom)
// Add to tailwind.config.ts:
theme: {
  extend: {
    padding: {
      safe: 'env(safe-area-inset-bottom)',
    }
  }
}
```

---

## Definition of Done

- [ ] Layout renders correctly on 375px and 1440px
- [ ] Sidebar visible on desktop, bottom nav on mobile
- [ ] Pipeline page shows kanban + list view toggle
- [ ] Overdue follow-ups alert shown on pipeline
- [ ] Lead list has filters: status, priority, tier, search
- [ ] Lead detail has 5 tabs: Overview, Enrichment, Demo, Activity, Notes
- [ ] Score breakdown shows all 8 factors with bars
- [ ] Outreach timeline shows all event types
- [ ] Log event modal opens camera on mobile
- [ ] Analytics page shows funnel + team stats (admin only)
- [ ] All admin-only pages redirect non-admins
- [ ] Mobile bottom nav shows correct items per role
