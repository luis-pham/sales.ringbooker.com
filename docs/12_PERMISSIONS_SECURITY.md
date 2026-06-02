# 12 — Permissions & Security
> Security checklist, RLS policies summary, permissions matrix

---

## Security Layers

```
Layer 1: Middleware (Next.js)
  → Block unauthenticated requests
  → Block non-invited emails
  → Block deactivated users
  → Block wrong role on admin routes

Layer 2: API Route guards
  → Re-verify session on every API call
  → Check role permissions
  → Check resource ownership (outreacher → own leads)

Layer 3: Supabase RLS
  → Database-level row security
  → Enforced even if API layer bypassed
  → Never rely on API layer alone

Layer 4: Storage policies
  → Evidence files: private bucket
  → Signed URLs only (expire after 1 hour)
  → Users can only access own files (admins: all)

Layer 5: Input validation
  → Zod schema on all API inputs
  → File type + size validation on uploads
  → SQL injection: Supabase handles via parameterized queries
```

---

## Permissions Matrix

| Action | Admin | Outreacher | Viewer |
|--------|-------|------------|--------|
| View all leads | ✅ | ❌ | ❌ |
| View assigned leads | ✅ | ✅ | ✅ |
| Update lead notes/tags | ✅ | ✅ (own) | ❌ |
| Update lead status | ✅ | ✅ (own, forward only) | ❌ |
| Assign lead to user | ✅ | ❌ | ❌ |
| Trigger enrichment | ✅ | ❌ | ❌ |
| Trigger scoring | ✅ | ❌ | ❌ |
| Run search | ✅ | ❌ | ❌ |
| Build demo | ✅ | ✅ (own) | ❌ |
| Update demo status | ✅ | ✅ (own) | ❌ |
| Log outreach event | ✅ | ✅ (own) | ❌ |
| Upload screenshot | ✅ | ✅ (own) | ❌ |
| Schedule follow-up | ✅ | ✅ (own) | ❌ |
| Complete follow-up | ✅ | ✅ (own) | ❌ |
| View team analytics | ✅ | ❌ | ❌ |
| View own analytics | ✅ | ✅ | ❌ |
| Invite users | ✅ | ❌ | ❌ |
| Deactivate users | ✅ | ❌ | ❌ |
| Change user role | ✅ | ❌ | ❌ |
| View all demos | ✅ | ❌ | ❌ |
| Bulk create demos | ✅ | ❌ | ❌ |

---

## Security Checklist

### Authentication
- [ ] Google OAuth only — no password auth
- [ ] Email allowlist enforced in middleware
- [ ] Deactivated users blocked on every request
- [ ] Session cookie HTTP-only, Secure, SameSite=Lax

### API Security
- [ ] Every API route calls `getSessionUser()` first
- [ ] Role checked before any data access
- [ ] Resource ownership verified for outreacher actions
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never in client code
- [ ] `INTERNAL_API_SECRET` only in server environment
- [ ] Zod validation on all POST/PATCH bodies
- [ ] Rate limiting via Supabase or middleware (add if needed)

### Database
- [ ] RLS enabled on all 11 tables
- [ ] Service role key only in `createAdminClient()`
- [ ] No raw SQL with user input
- [ ] No `SELECT *` on sensitive tables in client queries

### File Uploads
- [ ] Evidence bucket is private (not public)
- [ ] File type validated: images only
- [ ] File size limit: 10MB per file
- [ ] Storage path includes userId (prevents path traversal)
- [ ] Signed URLs expire after 1 hour

### Secrets
- [ ] All secrets in `.env.local` only
- [ ] `.env.local` in `.gitignore`
- [ ] No secrets in client-side code
- [ ] Vercel env vars set correctly per environment

### Worker/Internal
- [ ] Worker API protected by `X-Internal-Secret` header
- [ ] Webhook endpoint validates payload signature `[FUTURE]`
- [ ] Worker never exposes errors to client responses

---

## Environment Security Config

```typescript
// src/lib/utils/security.ts

// Validate all required env vars on startup
export function validateEnv(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'INTERNAL_API_SECRET',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// Constant-time string comparison (prevent timing attacks)
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  let result = 0
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i]
  }
  return result === 0
}

// Verify internal API secret
export function verifyInternalSecret(secret: string | null): boolean {
  if (!secret) return false
  return secureCompare(secret, process.env.INTERNAL_API_SECRET ?? '')
}
```

---

## RLS Policy Summary

### salon_leads
```
admin: SELECT, INSERT, UPDATE, DELETE — all rows
outreacher: SELECT — only assigned_to = auth.uid()
outreacher: UPDATE — only assigned_to = auth.uid(),
            only allowed statuses (dm_sent, replied, etc.)
```

### outreach_events
```
admin: all
outreacher: all — only for leads where assigned_to = auth.uid()
```

### outreach_evidence
```
admin: all
outreacher: all — only own uploads (uploaded_by = auth.uid())
outreacher: SELECT — leads assigned to them
```

### ringbooker_demos
```
admin: all
outreacher: SELECT — created_by = auth.uid() OR assigned lead
outreacher: INSERT — only for assigned leads
```

### jobs
```
service_role only — worker never exposed to frontend
```

---

## Definition of Done

- [ ] `validateEnv()` called in `next.config.ts`
- [ ] `verifyInternalSecret()` used in worker API route
- [ ] All 11 tables have RLS enabled
- [ ] Storage bucket is private
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` in any client component
- [ ] Security checklist reviewed and all items checked
- [ ] `.env.example` has all vars listed (no values)
- [ ] `.gitignore` includes `.env.local`
