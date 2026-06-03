-- Auto lead-assignment engine: config singleton + per-lead assignment timestamp.

-- When a lead was assigned (used for the per-day flow cap and for reclaim logic).
alter table salon_leads add column if not exists assigned_at timestamptz;
create index if not exists leads_assigned_at_idx on salon_leads(assigned_at);

-- Singleton config for the auto-assignment engine (mirrors worker_settings pattern).
create table if not exists assignment_config (
  id            boolean primary key default true check (id = true),
  -- Which business verticals to assign (matches lead_search_runs.vertical keys).
  verticals     text[]  not null default array['hair_salon','nail_salon'],
  -- Flow cap: max NEW leads assigned to each rep per day.
  max_per_day   integer not null default 20 check (max_per_day between 1 and 500),
  -- 'p1_only' | 'p2_only' | 'p3_only' | 'waterfall' (P1→P2→P3)
  priority_mode text    not null default 'waterfall'
                  check (priority_mode in ('p1_only','p2_only','p3_only','waterfall')),
  -- Separate pause switch — independent of the global worker pause.
  is_paused     boolean not null default false,
  last_run_at   timestamptz,
  last_run_assigned integer not null default 0,
  updated_by    text,
  updated_at    timestamptz not null default now()
);

insert into assignment_config (id) values (true) on conflict (id) do nothing;

alter table assignment_config enable row level security;

create policy assignment_config_admin_all on assignment_config for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
