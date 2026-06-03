-- Data-quality flag: lead has at least one social channel (Instagram or Facebook).
-- Generated column so it stays in sync automatically as enrichment populates URLs.
-- Leads with has_social = false are surfaced to admins and blocked from rep assignment
-- (enforced in /api/leads/[id]/assign) — they are NOT deleted.

alter table salon_leads
  add column if not exists has_social boolean
  generated always as (instagram_url is not null or facebook_url is not null) stored;

create index if not exists leads_has_social_idx on salon_leads(has_social);
