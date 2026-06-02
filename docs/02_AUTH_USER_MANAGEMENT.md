# 02 — Auth & User Management
> Depends on: 00_PROJECT_OVERVIEW.md, 01_DATABASE_SCHEMA.md
> Login via Google OAuth only. Email allowlist. Role-based access.

---

## Overview

- **Login**: Google OAuth only (no email/password)
- **Restriction**: Only pre-invited emails can access
- **Roles**: `admin` (full access) | `outreacher` (assigned leads only)
- **Invite flow**: Admin sends invite link → user clicks → signs in with Google → auto-assigned role

---

## 1. Supabase Auth Config

In Supabase Dashboard → Authentication → Providers:

1. Enable **Google** provider
2. Add Google OAuth credentials:
   - Client ID: from Google Cloud Console
   - Client Secret: from Google Cloud Console
3. Add redirect URL: `https://sales.ringbooker.com/auth/callback`
4. In Google Cloud Console → OAuth consent screen → Authorized domains: `sales.ringbooker.com`

---

## 2. Files to Create

### `src/lib/supabase/client.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### `src/lib/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

### `src/lib/supabase/admin.ts`
```typescript
import { createClient } from '@supabase/supabase-js'

// ONLY use server-side — never import in client components
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

---

## 3. Middleware

### `middleware.ts` (root of project)

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/invite',
  '/unauthorized',
]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return supabaseResponse
  }

  // Allow API webhooks (no auth needed)
  if (pathname.startsWith('/api/webhooks/')) {
    return supabaseResponse
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in → redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check email domain allowlist
  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? '').split(',').map(d => d.trim())
  const emailDomain = user.email?.split('@')[1] ?? ''

  if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain)) {
    // Check if they have an accepted invitation
    const { data: invite } = await supabase
      .from('invitations')
      .select('id, role, accepted_at')
      .eq('email', user.email!)
      .not('accepted_at', 'is', null)
      .single()

    if (!invite) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }

  // Check if profile exists and is active
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  // Admin-only routes
  const ADMIN_PATHS = ['/team', '/analytics', '/search']
  if (
    ADMIN_PATHS.some(path => pathname.startsWith(path)) &&
    profile.role !== 'admin'
  ) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## 4. Auth Pages

### `src/app/(auth)/login/page.tsx`

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'

  async function handleGoogleSignIn() {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="font-semibold text-slate-900">RingBooker Sales</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in with your RingBooker Google account
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button
            onClick={handleGoogleSignIn}
            disabled={loading}
            variant="outline"
            className="w-full h-11 text-sm font-medium gap-3"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {loading ? 'Signing in...' : 'Continue with Google'}
          </Button>

          <p className="text-xs text-slate-400 text-center mt-4">
            Access restricted to invited team members only
          </p>
        </div>
      </div>
    </div>
  )
}
```

### `src/app/auth/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') ?? '/'
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${error}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      return NextResponse.redirect(`${origin}/login?error=${exchangeError.message}`)
    }

    // Redirect to intended page or dashboard
    const safePath = redirect.startsWith('/') ? redirect : '/'
    return NextResponse.redirect(`${origin}${safePath}`)
  }

  return NextResponse.redirect(`${origin}/login`)
}
```

### `src/app/(auth)/invite/[token]/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { AcceptInviteClient } from './AcceptInviteClient'

export default async function InvitePage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  // Validate token
  const { data: invitation } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invitation) {
    notFound()
  }

  // Check if already logged in
  const { data: { user } } = await supabase.auth.getUser()

  if (user && user.email === invitation.email) {
    // Accept invitation automatically
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    // Update profile role
    await supabase
      .from('profiles')
      .update({ role: invitation.role })
      .eq('id', user.id)

    redirect('/')
  }

  return <AcceptInviteClient invitation={invitation} token={token} />
}
```

---

## 5. Auth Helpers

### `src/lib/auth/helpers.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile, UserRole } from '@/types'
import { redirect } from 'next/navigation'

// Get current user profile — throws if not authenticated
export async function requireAuth(): Promise<Profile> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    redirect('/unauthorized')
  }

  return profile
}

// Require specific role
export async function requireRole(role: UserRole | UserRole[]): Promise<Profile> {
  const profile = await requireAuth()
  const roles = Array.isArray(role) ? role : [role]

  if (!roles.includes(profile.role as UserRole)) {
    redirect('/')
  }

  return profile
}

// For API routes — returns null instead of redirecting
export async function getSessionUser(): Promise<{
  user: { id: string; email: string } | null
  profile: Profile | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return {
    user: { id: user.id, email: user.email! },
    profile: profile ?? null
  }
}

// Send invite email
export async function sendInvitation(
  email: string,
  role: UserRole,
  invitedBy: string
): Promise<{ token: string } | { error: string }> {
  const adminClient = createAdminClient()

  // Check if already invited
  const { data: existing } = await adminClient
    .from('invitations')
    .select('id, accepted_at')
    .eq('email', email)
    .single()

  if (existing?.accepted_at) {
    return { error: 'User is already a team member' }
  }

  // Create or refresh invitation
  const token = crypto.randomUUID().replace(/-/g, '')

  const { data: invitation, error } = await adminClient
    .from('invitations')
    .upsert({
      email,
      role,
      invited_by: invitedBy,
      token,
      accepted_at: null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'email' })
    .select()
    .single()

  if (error) return { error: error.message }

  // TODO: Send email with invitation link
  // await sendInviteEmail(email, token)

  return { token: invitation.token }
}
```

---

## 6. Team Management Page (Admin Only)

### `src/app/(dashboard)/team/page.tsx`

```tsx
import { requireRole } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { TeamClient } from './TeamClient'

export default async function TeamPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .order('created_at'),
    supabase
      .from('invitations')
      .select('*, invited_by_profile:profiles!invitations_invited_by_fkey(full_name)')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
  ])

  return <TeamClient members={members ?? []} invitations={invitations ?? []} />
}
```

### `src/components/team/TeamClient.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { InviteModal } from './InviteModal'
import { formatDistanceToNow } from 'date-fns'
import { UserPlus, MoreHorizontal, Clock } from 'lucide-react'
import type { Profile } from '@/types'

const ROLE_COLORS = {
  admin: 'bg-violet-100 text-violet-700',
  outreacher: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export function TeamClient({ members, invitations }: {
  members: Profile[]
  invitations: any[]
}) {
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          size="sm"
          className="gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite member
        </Button>
      </div>

      {/* Members list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        {members.map((member, index) => (
          <div
            key={member.id}
            className={`flex items-center gap-3 px-4 py-3 ${
              index < members.length - 1 ? 'border-b border-slate-100' : ''
            }`}
          >
            <Avatar className="w-8 h-8">
              <AvatarImage src={member.avatar_url ?? undefined} />
              <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-medium">
                {(member.full_name ?? member.email)[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 truncate">
                  {member.full_name ?? member.email}
                </span>
                {!member.is_active && (
                  <Badge variant="outline" className="text-xs text-slate-400">
                    Inactive
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-400">{member.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role as keyof typeof ROLE_COLORS]}`}>
                {member.role}
              </span>
              {member.last_seen_at && (
                <span className="text-xs text-slate-400 hidden sm:block">
                  {formatDistanceToNow(new Date(member.last_seen_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending invitations ({invitations.length})
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {invitations.map((inv, index) => (
              <div
                key={inv.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index < invitations.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <span className="text-slate-400 text-xs">?</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-700">{inv.email}</span>
                  <p className="text-xs text-slate-400">
                    Invited {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                    {' · '}Expires {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[inv.role as keyof typeof ROLE_COLORS]}`}>
                  {inv.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />
    </div>
  )
}
```

### `src/components/team/InviteModal.tsx`

```tsx
'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

export function InviteModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('outreacher')
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit() {
    if (!email) return
    setLoading(true)

    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })

    const data = await res.json()

    if (data.error) {
      toast.error(data.error)
    } else {
      const link = `${window.location.origin}/invite/${data.token}`
      setInviteLink(link)
      toast.success('Invitation created')
    }

    setLoading(false)
  }

  async function handleCopy() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    setEmail('')
    setRole('outreacher')
    setInviteLink(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>
            Send an invitation link. The person must sign in with the invited email address.
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-slate-600">
                email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="sarah@ringbooker.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outreacher">
                    <div>
                      <div className="font-medium">Outreacher</div>
                      <div className="text-xs text-slate-400">Can send DMs, log outreach on assigned leads</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div>
                      <div className="font-medium">Viewer</div>
                      <div className="text-xs text-slate-400">Read-only access</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={loading || !email}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Send invite
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-2 space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm text-emerald-700 font-medium mb-1">Invitation created!</p>
              <p className="text-xs text-emerald-600">
                Share this link with {email}. It expires in 7 days.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                value={inviteLink}
                readOnly
                className="text-xs font-mono bg-slate-50"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied
                  ? <Check className="w-4 h-4 text-emerald-600" />
                  : <Copy className="w-4 h-4" />
                }
              </Button>
            </div>

            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

---

## 7. Team API Route

### `src/app/api/team/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, sendInvitation } from '@/lib/auth/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['outreacher', 'viewer']),
})

export async function GET() {
  const { profile } = await getSessionUser()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const { data: members } = await adminClient
    .from('profiles')
    .select('*')
    .order('created_at')

  return NextResponse.json({ data: members })
}

export async function POST(request: NextRequest) {
  const { user, profile } = await getSessionUser()

  if (!user || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = inviteSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    )
  }

  const result = await sendInvitation(parsed.data.email, parsed.data.role, user.id)

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ token: result.token })
}
```

### `src/app/api/team/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const updateSchema = z.object({
  role: z.enum(['outreacher', 'viewer']).optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile } = await getSessionUser()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Cannot modify own account
  if (id === profile.id) {
    return NextResponse.json({ error: 'Cannot modify own account' }, { status: 400 })
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
```

---

## 8. Current User Hook

### `src/hooks/useCurrentUser.ts`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export function useCurrentUser() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(data)
      setLoading(false)
    }

    loadProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadProfile()
    })

    return () => subscription.unsubscribe()
  }, [])

  return { profile, loading, isAdmin: profile?.role === 'admin' }
}
```

---

## 9. Unauthorized Page

### `src/app/unauthorized/page.tsx`

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-6 h-6 text-red-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Access denied</h1>
        <p className="text-sm text-slate-500 mb-6">
          Your account doesn't have access to this tool.
          Contact the RingBooker admin to get an invitation.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    </div>
  )
}
```

---

## Definition of Done

- [ ] Supabase Google OAuth configured in dashboard
- [ ] `middleware.ts` created — blocks unauthenticated access
- [ ] Email domain allowlist working (non-ringbooker.com blocked)
- [ ] `/login` page renders Google sign-in button
- [ ] `/auth/callback` route handles OAuth redirect
- [ ] `/invite/[token]` page validates token and accepts invite
- [ ] `/team` page shows members list (admin only)
- [ ] Invite modal creates invitation and shows shareable link
- [ ] `PATCH /api/team/[id]` updates role or deactivates user
- [ ] Outreacher cannot access `/team`, `/analytics`, `/search`
- [ ] Deactivated user is blocked on next request
- [ ] `useCurrentUser` hook works in client components
