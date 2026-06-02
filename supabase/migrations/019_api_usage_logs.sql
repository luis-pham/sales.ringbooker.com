create table if not exists api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  job_id uuid references jobs(id) on delete set null,
  search_run_id uuid references lead_search_runs(id) on delete set null,
  lead_id uuid references salon_leads(id) on delete set null,
  units integer not null default 1,
  estimated_cost_usd numeric(10, 6) not null default 0,
  status text not null default 'success' check (status in ('success', 'error')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_logs_created_at_idx on api_usage_logs(created_at desc);
create index if not exists api_usage_logs_provider_idx on api_usage_logs(provider);
create index if not exists api_usage_logs_job_id_idx on api_usage_logs(job_id) where job_id is not null;

alter table api_usage_logs enable row level security;

create policy api_usage_logs_admin_all on api_usage_logs for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
