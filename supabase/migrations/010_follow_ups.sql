create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete set null,
  scheduled_for timestamptz not null,
  type text not null check (type in ('dm_followup', 'share_demo', 'check_viewed', 'pricing_call', 'close')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'overdue')),
  notes text,
  completed_at timestamptz,
  completed_by uuid references profiles(id) on delete set null,
  outcome text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists follow_ups_updated_at on follow_ups;
create trigger follow_ups_updated_at
  before update on follow_ups
  for each row execute function update_updated_at();

create index if not exists follow_ups_lead_idx on follow_ups(lead_id);
create index if not exists follow_ups_assigned_idx on follow_ups(assigned_to);
create index if not exists follow_ups_scheduled_idx on follow_ups(scheduled_for);
create index if not exists follow_ups_status_idx on follow_ups(status);

alter table follow_ups enable row level security;

create policy follow_ups_admin_all on follow_ups for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy follow_ups_outreacher_assigned on follow_ups for all
  using (assigned_to = auth.uid());
