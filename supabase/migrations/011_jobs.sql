create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'search_run', 'enrich_lead', 'enrich_instagram',
    'score_lead', 'score_batch', 'auto_create_demo', 'cleanup'
  )),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'dead')),
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists jobs_updated_at on jobs;
create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

create index if not exists jobs_queue_idx on jobs(status, next_run_at) where status in ('pending', 'failed');
create index if not exists jobs_type_idx on jobs(type);

alter table jobs enable row level security;

create policy jobs_service_role_only on jobs for all
  using (auth.role() = 'service_role');

create or replace function claim_next_job(p_worker_id text)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs;
begin
  select *
  into v_job
  from jobs
  where status = 'pending'
    and next_run_at <= now()
  order by created_at asc
  limit 1
  for update skip locked;

  if v_job.id is null then
    return null;
  end if;

  update jobs
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempts = attempts + 1,
      updated_at = now()
  where id = v_job.id;

  return v_job;
end;
$$;

create or replace function release_stale_jobs(p_timeout_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update jobs
  set status = 'pending',
      locked_at = null,
      locked_by = null,
      next_run_at = now(),
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - (p_timeout_minutes || ' minutes')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function get_pipeline_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select json_build_object(
      'total', count(*),
      'new', count(*) filter (where status = 'new'),
      'dm_sent', count(*) filter (where status = 'dm_sent'),
      'replied', count(*) filter (where status = 'replied'),
      'demo_shared', count(*) filter (where status = 'demo_shared'),
      'demo_viewed', count(*) filter (where status = 'demo_viewed'),
      'demo_completed', count(*) filter (where status = 'demo_completed'),
      'converted', count(*) filter (where status = 'converted'),
      'lost', count(*) filter (where status = 'lost'),
      'priority_1', count(*) filter (where status = 'outreach_ready'),
      'conversion_rate', round(count(*) filter (where status = 'converted')::numeric / nullif(count(*), 0) * 100, 1)
    )
    from salon_leads
  );
end;
$$;
