-- Apply this if migrations 001-012 were run before the security hardening pass.

drop policy if exists profiles_update_own on profiles;

drop policy if exists invitations_select_by_token on invitations;
drop policy if exists invitations_select_accepted_self on invitations;
create policy invitations_select_accepted_self
  on invitations for select
  using (
    accepted_at is not null
    and email = (auth.jwt() ->> 'email')
  );

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

do $$
begin
  execute 'drop policy if exists evidence_upload_authenticated on storage.objects';
  execute 'drop policy if exists evidence_read_own on storage.objects';
  execute 'drop policy if exists evidence_delete_own on storage.objects';
end $$;

create policy evidence_upload_authenticated
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy evidence_read_own
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
  );

create policy evidence_delete_own
  on storage.objects for delete
  using (
    bucket_id = 'evidence'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
