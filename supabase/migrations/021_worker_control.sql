-- Add 'cancelled' to job status
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check check (
  status in ('pending', 'processing', 'completed', 'failed', 'dead', 'cancelled')
);

-- Singleton table for global worker settings
create table if not exists worker_settings (
  id boolean primary key default true check (id = true),
  is_paused boolean not null default false,
  paused_by text,
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into worker_settings (id, is_paused) values (true, false)
  on conflict (id) do nothing;

alter table worker_settings enable row level security;

create policy worker_settings_admin_all on worker_settings for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
