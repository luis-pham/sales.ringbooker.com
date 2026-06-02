create table if not exists outreach_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  demo_id uuid references ringbooker_demos(id) on delete set null,
  type text not null check (type in (
    'dm_sent', 'email_sent', 'demo_created', 'demo_shared', 'demo_viewed',
    'demo_completed', 'reply_received', 'follow_up_sent', 'call_completed',
    'converted', 'lost', 'disqualified', 'note', 'status_changed', 'assigned'
  )),
  channel text check (channel in ('instagram_dm', 'facebook_dm', 'email', 'whatsapp', 'phone', 'other')),
  notes text,
  metadata jsonb default '{}',
  prev_status text,
  new_status text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists outreach_events_lead_idx on outreach_events(lead_id);
create index if not exists outreach_events_type_idx on outreach_events(type);
create index if not exists outreach_events_created_at_idx on outreach_events(created_at desc);

alter table outreach_events enable row level security;

create policy events_admin_all on outreach_events for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy events_outreacher_own_leads on outreach_events for all
  using (exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid()));
