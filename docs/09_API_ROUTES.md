# 09 — API Routes Reference
> Complete API spec for all endpoints in sales.ringbooker.com

---

## Auth & Headers

All endpoints require authenticated Supabase session via cookie.
No API key auth for client requests.

```
Cookie: sb-access-token=...
Content-Type: application/json
```

Webhook endpoints use `X-Internal-Api-Key` header (server-to-server only).

---

## Error format

```json
{ "error": "Human readable message", "code": "ERROR_CODE" }
```

HTTP status codes:
- `400` Bad request / validation error
- `401` Not authenticated
- `403` Forbidden (wrong role or wrong assignment)
- `404` Not found
- `500` Server error

---

## Endpoints

### Auth

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/auth/callback` | public | OAuth callback handler |
| GET | `/invite/[token]` | public | Accept invitation page |

---

### Team Management

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/team` | admin | List all team members |
| POST | `/api/team` | admin | Invite new member |
| PATCH | `/api/team/[id]` | admin | Update role or deactivate |

**POST /api/team**
```json
// Request
{ "email": "sarah@ringbooker.com", "role": "outreacher" }

// Response 200
{ "token": "abc123..." }
```

**PATCH /api/team/[id]**
```json
// Request
{ "role": "viewer" }
// or
{ "is_active": false }

// Response 200
{ "data": { ...profile } }
```

---

### Search Runs

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/search` | all | List search runs |
| POST | `/api/search` | admin | Start new search run |

**POST /api/search**
```json
// Request
{
  "query": "hair salons",
  "city": "Houston",
  "state": "TX",
  "max_results": 50
}

// Response 200
{
  "data": {
    "searchRunId": "uuid",
    "jobId": "uuid",
    "status": "queued"
  }
}
```

---

### Leads

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/leads` | all | List leads (filtered by role) |
| GET | `/api/leads/[id]` | all | Get lead detail |
| PATCH | `/api/leads/[id]` | all | Update notes/tags/assigned_to |
| POST | `/api/leads/[id]/enrich` | admin | Trigger enrichment |
| POST | `/api/leads/[id]/score` | admin | Trigger scoring |
| POST | `/api/leads/[id]/demo` | all | Create demo for lead |
| GET | `/api/leads/[id]/demo` | all | Get demos for lead |
| POST | `/api/leads/[id]/assign` | admin | Assign to outreacher |

**GET /api/leads — Query params**
```
status=dm_sent,replied        (comma-separated)
priority=1                    (1, 2, 3)
tier=A,B                      (A, B, C)
city=Houston
assignedTo=uuid
search=salon name             (fuzzy name search)
page=1
limit=50
sortBy=score|created_at|rating|review_count
sortOrder=asc|desc
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Luxe Hair Studio",
      "city": "Houston",
      "state": "TX",
      "phone": "+17135551234",
      "website_url": "https://luxehair.com",
      "instagram_url": "https://instagram.com/luxehair",
      "rating": 4.3,
      "review_count": 128,
      "status": "dm_sent",
      "assigned_to": "uuid",
      "lead_scores": [{
        "score": 78,
        "priority": 1,
        "tier": "A",
        "tier_platform": "square",
        "recommended_pitch": "..."
      }],
      "ringbooker_demos": [{
        "id": "uuid",
        "demo_url": "https://ringbooker.com/demo/hair?...",
        "status": "shared"
      }]
    }
  ],
  "total": 150,
  "page": 1,
  "hasMore": true
}
```

**PATCH /api/leads/[id]**
```json
// Request (any combination)
{
  "notes": "Owner is Vietnamese, very interested",
  "tags": ["interested", "follow-up"],
  "assigned_to": "uuid"
}
```

**POST /api/leads/[id]/assign**
```json
// Request
{ "userId": "uuid" }

// Response 200
{ "data": { "success": true } }
```

---

### Outreach Events

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/outreach/[leadId]` | all | Get event timeline |
| POST | `/api/outreach/[leadId]` | all | Log new event |

**POST /api/outreach/[leadId]**
```json
// Request
{
  "type": "dm_sent",
  "channel": "instagram_dm",
  "notes": "Sent personalized message with demo link",
  "demoId": "uuid"
}

// Response 200
{ "data": { "eventId": "uuid" } }
```

---

### Evidence (Screenshots)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/evidence` | all | Upload screenshot |

**POST /api/evidence — multipart/form-data**
```
file:    <image file>
leadId:  uuid
eventId: uuid
type:    dm_screenshot | reply_screenshot | demo_shared_screenshot | converted_proof | other
notes:   optional string
```

**Response 200**
```json
{
  "data": {
    "evidenceId": "uuid",
    "storagePath": "user-id/lead-id/timestamp-dm_screenshot.jpg",
    "publicUrl": "https://...signed-url..."
  }
}
```

---

### Demos

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/demos` | admin | List all demos |
| POST | `/api/demos/bulk` | admin | Bulk create demos |
| PATCH | `/api/demos/[id]/status` | all | Update demo status |

**POST /api/demos/bulk**
```json
// Request
{ "leadIds": ["uuid1", "uuid2", "uuid3"] }

// Response 200
{
  "data": {
    "queued": 3,
    "skipped": 0,
    "total": 3
  }
}
```

**PATCH /api/demos/[id]/status**
```json
// Request
{
  "status": "shared",
  "notes": "Sent via Instagram DM"
}

// Response 200
{ "data": { "success": true, "status": "shared" } }
```

---

### Follow-ups

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/follow-ups` | all | List follow-ups (own only for outreacher) |
| POST | `/api/follow-ups` | all | Schedule follow-up |
| PATCH | `/api/follow-ups/[id]` | all | Complete follow-up |

**POST /api/follow-ups**
```json
// Request
{
  "leadId": "uuid",
  "scheduledFor": "2026-06-10T14:00:00Z",
  "type": "dm_followup",
  "notes": "Check if they watched the demo"
}
```

**PATCH /api/follow-ups/[id]**
```json
// Request
{
  "status": "completed",
  "outcome": "Interested, will discuss with partner"
}
```

---

### Jobs (internal worker only)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/jobs/worker` | internal | Process single job (Vercel cron) |

```typescript
// Secured by INTERNAL_API_SECRET header
// X-Internal-Secret: process.env.INTERNAL_API_SECRET
```

---

### Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/webhooks/ringbooker` | HMAC | [FUTURE] Receive demo events |

---

### Analytics

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/pipeline` | admin | Pipeline funnel stats |
| GET | `/api/analytics/team` | admin | Per-member performance |
| GET | `/api/analytics/demos` | admin | Demo conversion stats |

**GET /api/analytics/pipeline — Response**
```json
{
  "data": {
    "total": 450,
    "by_status": {
      "new": 120,
      "scored": 180,
      "outreach_ready": 50,
      "dm_sent": 60,
      "replied": 20,
      "demo_shared": 12,
      "demo_viewed": 8,
      "demo_completed": 5,
      "converted": 3,
      "lost": 10
    },
    "conversion_rate": 0.67,
    "avg_score_converted": 81,
    "by_tier": { "A": 45, "B": 120, "C": 285 },
    "by_city": { "Houston": 180, "Atlanta": 120 }
  }
}
```
