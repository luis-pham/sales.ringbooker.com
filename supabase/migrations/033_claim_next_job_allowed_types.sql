drop function if exists claim_next_job(text);
drop function if exists claim_next_job(text, text[]);

create or replace function claim_next_job(
  p_worker_id text,
  p_allowed_types text[] default null
)
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
    and (p_allowed_types is null or type = any(p_allowed_types))
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
