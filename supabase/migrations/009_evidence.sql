create table if not exists outreach_evidence (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references outreach_events(id) on delete cascade,
  lead_id uuid not null references salon_leads(id) on delete cascade,
  type text not null check (type in (
    'dm_screenshot', 'reply_screenshot', 'demo_shared_screenshot',
    'demo_viewed_confirm', 'converted_proof', 'other'
  )),
  storage_path text not null,
  file_name text,
  file_size integer,
  mime_type text,
  uploaded_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists evidence_lead_idx on outreach_evidence(lead_id);
create index if not exists evidence_event_idx on outreach_evidence(event_id);

alter table outreach_evidence enable row level security;

create policy evidence_admin_all on outreach_evidence for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy evidence_uploader_own on outreach_evidence for all
  using (uploaded_by = auth.uid());
create policy evidence_read_assigned_lead on outreach_evidence for select
  using (exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid()));
