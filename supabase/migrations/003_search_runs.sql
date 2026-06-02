create table if not exists lead_search_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) on delete set null,
  query text not null default 'hair salons',
  city text not null,
  state text not null default 'TX',
  country text not null default 'US',
  provider text not null default 'serper' check (provider in ('serper', 'google_places')),
  max_results integer not null default 50 check (max_results between 10 and 500),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_found integer default 0,
  total_imported integer default 0,
  total_skipped integer default 0,
  total_duplicate integer default 0,
  estimated_cost_usd numeric(10, 4) default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table lead_search_runs enable row level security;

create policy search_runs_admin_all
  on lead_search_runs for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy search_runs_outreacher_select
  on lead_search_runs for select
  using (auth.uid() is not null);

create index if not exists search_runs_status_idx on lead_search_runs(status);
create index if not exists search_runs_created_by_idx on lead_search_runs(created_by);
create index if not exists search_runs_created_at_idx on lead_search_runs(created_at desc);
