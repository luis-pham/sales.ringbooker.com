-- Sales pipeline CRM: sales_stage tracking + demo session-level tracking from webhooks

-- 1. Simplified sales stage on salon_leads (parallel to existing status column)
alter table salon_leads
  add column if not exists sales_stage text
  check (sales_stage in (
    'ready','sent','viewed','hot','replied',
    'signedup','onboarding','trial','converted','ghosted','churned'
  ))
  default 'ready';

-- Back-fill from existing status so current leads start in the right place
update salon_leads set sales_stage =
  case status
    when 'outreach_ready'    then 'ready'
    when 'dm_sent'           then 'sent'
    when 'demo_shared'       then 'sent'
    when 'demo_viewed'       then 'viewed'
    when 'demo_completed'    then 'hot'
    when 'replied'           then 'replied'
    when 'converted'         then 'converted'
    when 'lost'              then 'ghosted'
    when 'disqualified'      then 'ghosted'
    else 'ready'
  end
where sales_stage = 'ready'
  and status in (
    'outreach_ready','dm_sent','demo_shared','demo_viewed',
    'demo_completed','replied','converted','lost','disqualified'
  );

create index if not exists idx_salon_leads_sales_stage
  on salon_leads(sales_stage) where sales_stage is not null;

-- 2. Demo slug on ringbooker_demos — links demo to ringbooker.com/{slug} for webhook lookups
alter table ringbooker_demos
  add column if not exists demo_slug text;

create unique index if not exists idx_ringbooker_demos_slug
  on ringbooker_demos(demo_slug) where demo_slug is not null;

-- 3. Per-session demo tracking — one row per play session from webhook
create table if not exists demo_sessions (
  id             uuid        primary key default gen_random_uuid(),
  demo_id        uuid        not null references ringbooker_demos(id) on delete cascade,
  lead_id        uuid        not null references salon_leads(id)      on delete cascade,
  slug           text        not null,
  started_at     timestamptz not null,
  hour_of_day    smallint,   -- 0-23, set by webhook for Morning/Afternoon/Evening badge
  duration_seconds integer,  -- null until progress/complete fires
  pct_reached    integer     not null default 0 check (pct_reached between 0 and 100),
  is_complete    boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_demo_sessions_lead_id on demo_sessions(lead_id);
create index if not exists idx_demo_sessions_demo_id on demo_sessions(demo_id);
create index if not exists idx_demo_sessions_slug    on demo_sessions(slug);
create index if not exists idx_demo_sessions_started on demo_sessions(started_at desc);

-- RLS
alter table demo_sessions enable row level security;

create policy "admin_all_demo_sessions"
  on demo_sessions for all to authenticated
  using  ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

create policy "outreacher_read_assigned_demo_sessions"
  on demo_sessions for select to authenticated
  using (
    lead_id in (
      select id from salon_leads where assigned_to = auth.uid()
    )
  );

-- updated_at trigger (reuse existing function if it exists, or create it)
create or replace function update_demo_sessions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_demo_sessions_updated_at
  before update on demo_sessions
  for each row execute procedure update_demo_sessions_updated_at();
