# 01 — Database Schema
> Depends on: 00_PROJECT_OVERVIEW.md
> Run all migrations in order via Supabase SQL Editor

---

## Setup Instructions

1. Go to Supabase Dashboard → SQL Editor
2. Run each migration file in order (001 → 011)
3. After all migrations, run the RPC functions section
4. Enable Supabase Storage bucket for evidence files

---

## Migration 001 — Profiles

```sql
-- supabase/migrations/001_profiles.sql

CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  full_name     text,
  avatar_url    text,
  role          text NOT NULL DEFAULT 'outreacher'
                  CHECK (role IN ('admin', 'outreacher', 'viewer')),
  is_active     boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile when user signs up via Google OAuth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET
      full_name  = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update last_seen_at on token refresh
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles SET last_seen_at = now() WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

CREATE POLICY "profiles_admin_all"
  ON profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Indexes
CREATE INDEX profiles_role_idx ON profiles(role);
CREATE INDEX profiles_email_idx ON profiles(email);
```

---

## Migration 002 — Invitations

```sql
-- supabase/migrations/002_invitations.sql

CREATE TABLE invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'outreacher'
                 CHECK (role IN ('outreacher', 'viewer')),
  token        text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accepted_at  timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_admin_all"
  ON invitations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "invitations_select_by_token"
  ON invitations FOR SELECT
  USING (true);  -- Token-based access, anyone with token can view

-- Indexes
CREATE INDEX invitations_email_idx ON invitations(email);
CREATE INDEX invitations_token_idx ON invitations(token);
CREATE INDEX invitations_expires_idx ON invitations(expires_at);
```

---

## Migration 003 — Search Runs

```sql
-- supabase/migrations/003_search_runs.sql

CREATE TABLE lead_search_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Config
  query            text NOT NULL DEFAULT 'hair salons',
  city             text NOT NULL,
  state            text NOT NULL DEFAULT 'TX',
  country          text NOT NULL DEFAULT 'US',
  provider         text NOT NULL DEFAULT 'serper'
                     CHECK (provider IN ('serper', 'google_places')),
  max_results      integer NOT NULL DEFAULT 50
                     CHECK (max_results BETWEEN 10 AND 500),
  -- Status
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending', 'running', 'completed', 'failed', 'cancelled'
                     )),
  -- Results
  total_found      integer DEFAULT 0,
  total_imported   integer DEFAULT 0,
  total_skipped    integer DEFAULT 0,
  total_duplicate  integer DEFAULT 0,
  -- Cost
  estimated_cost_usd numeric(10, 4) DEFAULT 0,
  -- Error
  error            text,
  -- Timing
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: only admins can create/manage search runs
ALTER TABLE lead_search_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_runs_admin_all"
  ON lead_search_runs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "search_runs_outreacher_select"
  ON lead_search_runs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX search_runs_status_idx ON lead_search_runs(status);
CREATE INDEX search_runs_created_by_idx ON lead_search_runs(created_by);
CREATE INDEX search_runs_created_at_idx ON lead_search_runs(created_at DESC);
```

---

## Migration 004 — Salon Leads

```sql
-- supabase/migrations/004_salon_leads.sql

CREATE TABLE salon_leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_run_id    uuid REFERENCES lead_search_runs(id) ON DELETE SET NULL,
  -- Identity
  name             text NOT NULL,
  phone            text,
  website_url      text,
  instagram_url    text,
  -- Location
  address          text,
  city             text,
  state            text,
  zip              text,
  lat              double precision,
  lng              double precision,
  -- Google data
  google_place_id  text UNIQUE,
  google_maps_url  text,
  rating           numeric(3, 1) CHECK (rating BETWEEN 0 AND 5),
  review_count     integer DEFAULT 0,
  categories       text[],
  -- Hours
  hours_raw        jsonb,
  is_open_sunday   boolean,
  closes_before_6pm boolean,
  -- Computed flags for scoring
  has_website      boolean GENERATED ALWAYS AS (website_url IS NOT NULL) STORED,
  has_phone        boolean GENERATED ALWAYS AS (phone IS NOT NULL) STORED,
  -- Status
  status           text NOT NULL DEFAULT 'new'
                     CHECK (status IN (
                       'new',
                       'enriching',
                       'enriched',
                       'scored',
                       'outreach_ready',
                       'dm_sent',
                       'replied',
                       'demo_shared',
                       'demo_viewed',
                       'demo_completed',
                       'follow_up_needed',
                       'converted',
                       'lost',
                       'disqualified'
                     )),
  -- Team assignment
  assigned_to      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Timestamps
  enriched_at      timestamptz,
  scored_at        timestamptz,
  last_outreach_at timestamptz,
  converted_at     timestamptz,
  -- Notes
  notes            text,
  tags             text[],
  -- Meta
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger: update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER salon_leads_updated_at
  BEFORE UPDATE ON salon_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE salon_leads ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "leads_admin_all"
  ON salon_leads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Outreacher: only see assigned leads
CREATE POLICY "leads_outreacher_assigned"
  ON salon_leads FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Outreacher: update status on their leads only
CREATE POLICY "leads_outreacher_update_assigned"
  ON salon_leads FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (
    assigned_to = auth.uid()
    AND status = ANY(ARRAY[
      'dm_sent', 'replied', 'demo_shared', 'demo_viewed',
      'demo_completed', 'follow_up_needed', 'lost'
    ])
  );

-- Indexes
CREATE INDEX leads_status_idx ON salon_leads(status);
CREATE INDEX leads_assigned_idx ON salon_leads(assigned_to);
CREATE INDEX leads_city_idx ON salon_leads(city);
CREATE INDEX leads_search_run_idx ON salon_leads(search_run_id);
CREATE INDEX leads_rating_idx ON salon_leads(rating DESC);
CREATE INDEX leads_created_at_idx ON salon_leads(created_at DESC);
```

---

## Migration 005 — Enrichment Snapshots

```sql
-- supabase/migrations/005_snapshots.sql

-- Raw provider data
CREATE TABLE lead_source_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('serper', 'google_places', 'manual')),
  provider_id text,
  raw         jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_snapshots_lead_idx ON lead_source_snapshots(lead_id);

-- Website enrichment
CREATE TABLE website_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  url                 text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'crawled', 'failed', 'skipped', 'blocked')),
  -- Extracted signals
  phones              text[],
  emails              text[],
  booking_urls        text[],
  platform_hits       jsonb,   -- [{platform, confidence, evidence, tier}]
  hours_detected      jsonb,
  cta_strength        text     CHECK (cta_strength IN ('strong', 'weak', 'none')),
  has_online_booking  boolean DEFAULT false,
  has_phone_visible   boolean DEFAULT false,
  instagram_links     text[],  -- Instagram URLs found on website
  -- Meta
  response_status     integer,
  error               text,
  crawl_duration_ms   integer,
  crawled_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX website_snapshots_lead_idx ON website_snapshots(lead_id);

-- Instagram enrichment
CREATE TABLE instagram_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  handle              text,
  profile_url         text,
  followers           integer,
  bio                 text,
  bio_links           text[],
  last_post_at        timestamptz,
  post_count_30d      integer,
  active_last_30_days boolean DEFAULT false,
  booking_link_in_bio boolean DEFAULT false,
  detected_platform   text,
  platform_confidence numeric(4, 2) DEFAULT 0,
  -- Meta
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'fetched', 'failed', 'not_found', 'private')),
  error               text,
  raw                 jsonb,
  fetched_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX instagram_snapshots_lead_idx ON instagram_snapshots(lead_id);

-- RLS for all snapshot tables (admin: all, outreacher: read assigned)
ALTER TABLE lead_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_admin_all" ON lead_source_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "snapshots_read_assigned_leads" ON lead_source_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salon_leads
      WHERE id = lead_id AND assigned_to = auth.uid()
    )
  );

-- Same policies for website_snapshots
CREATE POLICY "website_snapshots_admin_all" ON website_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "website_snapshots_read_assigned" ON website_snapshots FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM salon_leads WHERE id = lead_id AND assigned_to = auth.uid())
  );

-- Same for instagram_snapshots
CREATE POLICY "instagram_snapshots_admin_all" ON instagram_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "instagram_snapshots_read_assigned" ON instagram_snapshots FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM salon_leads WHERE id = lead_id AND assigned_to = auth.uid())
  );
```

---

## Migration 006 — Lead Scores

```sql
-- supabase/migrations/006_scores.sql

CREATE TABLE lead_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  -- Overall result
  score           integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  priority        integer NOT NULL CHECK (priority IN (1, 2, 3)),
  -- Factor breakdown (for explainability in UI)
  factors         jsonb NOT NULL DEFAULT '{}',
  -- Booking platform tier
  tier            text CHECK (tier IN ('A', 'B', 'C')),
  tier_platform   text,   -- 'square', 'vagaro', 'glossgenius', etc
  tier_reason     text,
  -- Pitch recommendation
  recommended_pitch text,
  -- Scoring metadata
  scoring_version text NOT NULL DEFAULT 'v1',
  scored_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one score per lead per version
CREATE UNIQUE INDEX lead_scores_lead_version_idx ON lead_scores(lead_id, scoring_version);
CREATE INDEX lead_scores_score_idx ON lead_scores(score DESC);
CREATE INDEX lead_scores_priority_idx ON lead_scores(priority);

-- RLS
ALTER TABLE lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scores_admin_all" ON lead_scores FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "scores_read_assigned" ON lead_scores FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM salon_leads WHERE id = lead_id AND assigned_to = auth.uid())
  );
```

---

## Migration 007 — Web Demos

```sql
-- supabase/migrations/007_demos.sql

CREATE TABLE ringbooker_demos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  -- Demo info
  salon_name      text NOT NULL,
  demo_vertical   text NOT NULL DEFAULT 'hair-salon',
  demo_config     jsonb,        -- { city, hours, services[], staffNames[] }
  -- Web demo URL (current implementation)
  demo_url        text,
  demo_url_params jsonb,        -- params used to build URL
  -- [FUTURE] Phone demo fields
  -- rb_request_id  text UNIQUE,
  -- rb_session_id  text,
  -- demo_phone     text,
  -- Status
  status          text NOT NULL DEFAULT 'prepared'
                    CHECK (status IN (
                      'prepared', 'shared', 'viewed', 'completed', 'expired'
                    )),
  -- Tracking
  share_count     integer NOT NULL DEFAULT 0,
  view_count      integer NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  -- Meta
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at      timestamptz DEFAULT (now() + interval '30 days'),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER demos_updated_at
  BEFORE UPDATE ON ringbooker_demos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX demos_lead_idx ON ringbooker_demos(lead_id);
CREATE INDEX demos_status_idx ON ringbooker_demos(status);
CREATE INDEX demos_created_by_idx ON ringbooker_demos(created_by);

-- RLS
ALTER TABLE ringbooker_demos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demos_admin_all" ON ringbooker_demos FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "demos_outreacher_assigned" ON ringbooker_demos FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM salon_leads WHERE id = lead_id AND assigned_to = auth.uid())
  );

CREATE POLICY "demos_outreacher_create" ON ringbooker_demos FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM salon_leads WHERE id = lead_id AND assigned_to = auth.uid())
  );
```

---

## Migration 008 — Outreach Events

```sql
-- supabase/migrations/008_outreach.sql

CREATE TABLE outreach_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  demo_id     uuid REFERENCES ringbooker_demos(id) ON DELETE SET NULL,
  -- Event type
  type        text NOT NULL CHECK (type IN (
    'dm_sent',
    'email_sent',
    'demo_created',
    'demo_shared',
    'demo_viewed',
    'demo_completed',
    'reply_received',
    'follow_up_sent',
    'call_completed',
    'converted',
    'lost',
    'disqualified',
    'note',
    'status_changed',
    'assigned'
  )),
  -- Channel
  channel     text CHECK (channel IN (
    'instagram_dm', 'facebook_dm', 'email',
    'whatsapp', 'phone', 'other'
  )),
  -- Content
  notes       text,
  metadata    jsonb DEFAULT '{}',
  -- Previous status (for status_changed events)
  prev_status text,
  new_status  text,
  -- Created by
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outreach_events_lead_idx ON outreach_events(lead_id);
CREATE INDEX outreach_events_type_idx ON outreach_events(type);
CREATE INDEX outreach_events_created_at_idx ON outreach_events(created_at DESC);

-- RLS
ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_admin_all" ON outreach_events FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "events_outreacher_own_leads" ON outreach_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM salon_leads
      WHERE id = lead_id AND assigned_to = auth.uid()
    )
  );
```

---

## Migration 009 — Evidence (Screenshots)

```sql
-- supabase/migrations/009_evidence.sql

CREATE TABLE outreach_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid REFERENCES outreach_events(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  -- File info
  type          text NOT NULL CHECK (type IN (
    'dm_screenshot',
    'reply_screenshot',
    'demo_shared_screenshot',
    'demo_viewed_confirm',
    'converted_proof',
    'other'
  )),
  storage_path  text NOT NULL,    -- Supabase Storage path
  file_name     text,
  file_size     integer,          -- bytes
  mime_type     text,
  -- Meta
  uploaded_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_lead_idx ON outreach_evidence(lead_id);
CREATE INDEX evidence_event_idx ON outreach_evidence(event_id);

-- RLS
ALTER TABLE outreach_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_admin_all" ON outreach_evidence FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "evidence_uploader_own" ON outreach_evidence FOR ALL
  USING (uploaded_by = auth.uid());

CREATE POLICY "evidence_read_assigned_lead" ON outreach_evidence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salon_leads
      WHERE id = lead_id AND assigned_to = auth.uid()
    )
  );
```

---

## Migration 010 — Follow-ups

```sql
-- supabase/migrations/010_follow_ups.sql

CREATE TABLE follow_ups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES salon_leads(id) ON DELETE CASCADE,
  assigned_to    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Schedule
  scheduled_for  timestamptz NOT NULL,
  type           text NOT NULL CHECK (type IN (
    'dm_followup',
    'share_demo',
    'check_viewed',
    'pricing_call',
    'close'
  )),
  -- Status
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
  -- Content
  notes          text,
  -- Completion
  completed_at   timestamptz,
  completed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  outcome        text,
  -- Meta
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Auto-mark as overdue via computed check (handled in application layer)
CREATE INDEX follow_ups_lead_idx ON follow_ups(lead_id);
CREATE INDEX follow_ups_assigned_idx ON follow_ups(assigned_to);
CREATE INDEX follow_ups_scheduled_idx ON follow_ups(scheduled_for);
CREATE INDEX follow_ups_status_idx ON follow_ups(status);

-- RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups_admin_all" ON follow_ups FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "follow_ups_outreacher_assigned" ON follow_ups FOR ALL
  USING (assigned_to = auth.uid());
```

---

## Migration 011 — Job Queue

```sql
-- supabase/migrations/011_jobs.sql

CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN (
    'search_run',
    'enrich_lead',
    'enrich_instagram',
    'score_lead',
    'score_batch',
    'cleanup'
  )),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  payload      jsonb NOT NULL DEFAULT '{}',
  result       jsonb,
  error        text,
  -- Queue management
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_at    timestamptz,
  locked_by    text,
  next_run_at  timestamptz NOT NULL DEFAULT now(),
  -- Meta
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX jobs_queue_idx
  ON jobs(status, next_run_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX jobs_type_idx ON jobs(type);

-- RLS: only service role (worker) manages jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_service_role_only" ON jobs FOR ALL
  USING (auth.role() = 'service_role');
```

---

## RPC Functions

Run after all migrations:

```sql
-- Atomic job claiming (prevents race conditions with multiple workers)
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id text)
RETURNS jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs;
BEGIN
  SELECT *
  INTO v_job
  FROM jobs
  WHERE status = 'pending'
    AND next_run_at <= now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE jobs
  SET
    status     = 'processing',
    locked_at  = now(),
    locked_by  = p_worker_id,
    attempts   = attempts + 1,
    updated_at = now()
  WHERE id = v_job.id;

  RETURN v_job;
END;
$$;

-- Release stale processing jobs (worker crashed)
CREATE OR REPLACE FUNCTION release_stale_jobs(p_timeout_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE jobs
  SET
    status      = 'pending',
    locked_at   = NULL,
    locked_by   = NULL,
    next_run_at = now(),
    updated_at  = now()
  WHERE status = 'processing'
    AND locked_at < now() - (p_timeout_minutes || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Pipeline stats for analytics
CREATE OR REPLACE FUNCTION get_pipeline_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'total',           COUNT(*),
      'new',             COUNT(*) FILTER (WHERE status = 'new'),
      'dm_sent',         COUNT(*) FILTER (WHERE status = 'dm_sent'),
      'replied',         COUNT(*) FILTER (WHERE status = 'replied'),
      'demo_shared',     COUNT(*) FILTER (WHERE status = 'demo_shared'),
      'demo_viewed',     COUNT(*) FILTER (WHERE status = 'demo_viewed'),
      'demo_completed',  COUNT(*) FILTER (WHERE status = 'demo_completed'),
      'converted',       COUNT(*) FILTER (WHERE status = 'converted'),
      'lost',            COUNT(*) FILTER (WHERE status = 'lost'),
      'priority_1',      COUNT(*) FILTER (WHERE status = 'outreach_ready'),
      'conversion_rate', ROUND(
        COUNT(*) FILTER (WHERE status = 'converted')::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      )
    )
    FROM salon_leads
  );
END;
$$;
```

---

## Supabase Storage Setup

Run in Supabase Dashboard → Storage:

```sql
-- Create evidence bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,
  10485760,  -- 10MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Storage RLS policies
CREATE POLICY "evidence_upload_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "evidence_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'evidence'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "evidence_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## TypeScript Types

File: `src/types/index.ts`

```typescript
export type UserRole = 'admin' | 'outreacher' | 'viewer'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export type LeadStatus =
  | 'new' | 'enriching' | 'enriched' | 'scored' | 'outreach_ready'
  | 'dm_sent' | 'replied' | 'demo_shared' | 'demo_viewed'
  | 'demo_completed' | 'follow_up_needed'
  | 'converted' | 'lost' | 'disqualified'

export type SalonLead = {
  id: string
  search_run_id: string | null
  name: string
  phone: string | null
  website_url: string | null
  instagram_url: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  google_place_id: string | null
  google_maps_url: string | null
  rating: number | null
  review_count: number | null
  categories: string[] | null
  hours_raw: Record<string, unknown> | null
  is_open_sunday: boolean | null
  closes_before_6pm: boolean | null
  has_website: boolean
  has_phone: boolean
  status: LeadStatus
  assigned_to: string | null
  enriched_at: string | null
  scored_at: string | null
  last_outreach_at: string | null
  converted_at: string | null
  notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export type LeadScore = {
  id: string
  lead_id: string
  score: number
  priority: 1 | 2 | 3
  factors: ScoringFactors
  tier: 'A' | 'B' | 'C' | null
  tier_platform: string | null
  tier_reason: string | null
  recommended_pitch: string | null
  scoring_version: string
  scored_at: string
  created_at: string
}

export type ScoringFactors = {
  noOnlineBooking: number
  businessAge: number
  ratingScore: number
  reviewCount: number
  afterHoursGap: number
  instagramActive: number
  hasWebsite: number
  respondsToReviews: number
}

export type OutreachEventType =
  | 'dm_sent' | 'email_sent' | 'demo_created' | 'demo_shared'
  | 'demo_viewed' | 'demo_completed' | 'reply_received'
  | 'follow_up_sent' | 'call_completed'
  | 'converted' | 'lost' | 'disqualified'
  | 'note' | 'status_changed' | 'assigned'

export type OutreachEvent = {
  id: string
  lead_id: string
  demo_id: string | null
  type: OutreachEventType
  channel: string | null
  notes: string | null
  metadata: Record<string, unknown>
  prev_status: string | null
  new_status: string | null
  created_by: string | null
  created_at: string
}

export type RingbookerDemo = {
  id: string
  lead_id: string
  salon_name: string
  demo_vertical: string
  demo_config: Record<string, unknown> | null
  demo_url: string | null
  status: 'prepared' | 'shared' | 'viewed' | 'completed' | 'expired'
  share_count: number
  view_count: number
  first_viewed_at: string | null
  last_viewed_at: string | null
  created_by: string | null
  expires_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type JobType =
  | 'search_run' | 'enrich_lead' | 'enrich_instagram'
  | 'score_lead' | 'score_batch' | 'cleanup'

export type Job = {
  id: string
  type: JobType
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead'
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  max_attempts: number
  locked_at: string | null
  locked_by: string | null
  next_run_at: string
  created_at: string
  updated_at: string
}

// API response types
export type ApiSuccess<T> = { data: T; error: null }
export type ApiError = { data: null; error: string; code?: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// Pagination
export type PaginatedResponse<T> = {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}
```

---

## Definition of Done

- [ ] All 11 migration files created in `supabase/migrations/`
- [ ] All migrations run successfully in Supabase SQL Editor
- [ ] `claim_next_job` RPC function created and tested
- [ ] `release_stale_jobs` RPC function created
- [ ] `get_pipeline_stats` RPC function created
- [ ] Storage bucket `evidence` created with correct policies
- [ ] `src/types/index.ts` created with all types
- [ ] No migration errors in Supabase logs
- [ ] RLS policies verified: outreacher cannot see other users' leads
