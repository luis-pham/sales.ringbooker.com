create table if not exists ringbooker_demos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  salon_name text not null,
  demo_vertical text not null default 'hair-salon',
  demo_config jsonb,
  demo_url text,
  demo_url_params jsonb,
  status text not null default 'prepared' check (status in ('prepared', 'shared', 'viewed', 'completed', 'expired')),
  share_count integer not null default 0,
  view_count integer not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz default (now() + interval '30 days'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists demos_updated_at on ringbooker_demos;
create trigger demos_updated_at
  before update on ringbooker_demos
  for each row execute function update_updated_at();

create index if not exists demos_lead_idx on ringbooker_demos(lead_id);
create index if not exists demos_status_idx on ringbooker_demos(status);
create index if not exists demos_created_by_idx on ringbooker_demos(created_by);

alter table ringbooker_demos enable row level security;

create policy demos_admin_all on ringbooker_demos for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy demos_outreacher_assigned on ringbooker_demos for select
  using (
    created_by = auth.uid()
    or exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid())
  );
create policy demos_outreacher_create on ringbooker_demos for insert
  with check (
    auth.uid() is not null
    and exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid())
  );
