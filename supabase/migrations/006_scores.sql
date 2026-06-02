create table if not exists lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  priority integer not null check (priority in (1, 2, 3)),
  factors jsonb not null default '{}',
  tier text check (tier in ('A', 'B', 'C')),
  tier_platform text,
  tier_reason text,
  recommended_pitch text,
  scoring_version text not null default 'v1',
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists lead_scores_lead_version_idx on lead_scores(lead_id, scoring_version);
create index if not exists lead_scores_score_idx on lead_scores(score desc);
create index if not exists lead_scores_priority_idx on lead_scores(priority);

alter table lead_scores enable row level security;

create policy scores_admin_all on lead_scores for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy scores_read_assigned on lead_scores for select
  using (exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid()));
