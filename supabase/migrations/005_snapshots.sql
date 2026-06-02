create table if not exists lead_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  provider text not null check (provider in ('serper', 'google_places', 'manual')),
  provider_id text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists website_snapshots (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  url text not null,
  status text not null default 'pending' check (status in ('pending', 'crawled', 'failed', 'skipped', 'blocked')),
  phones text[],
  emails text[],
  booking_urls text[],
  platform_hits jsonb,
  hours_detected jsonb,
  cta_strength text check (cta_strength in ('strong', 'weak', 'none')),
  has_online_booking boolean default false,
  has_phone_visible boolean default false,
  instagram_links text[],
  response_status integer,
  error text,
  crawl_duration_ms integer,
  crawled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists instagram_snapshots (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references salon_leads(id) on delete cascade,
  handle text,
  profile_url text,
  followers integer,
  bio text,
  bio_links text[],
  last_post_at timestamptz,
  post_count_30d integer,
  active_last_30_days boolean default false,
  booking_link_in_bio boolean default false,
  detected_platform text,
  platform_confidence numeric(4, 2) default 0,
  status text not null default 'pending' check (status in ('pending', 'fetched', 'failed', 'not_found', 'private')),
  error text,
  raw jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists source_snapshots_lead_idx on lead_source_snapshots(lead_id);
create unique index if not exists website_snapshots_lead_idx on website_snapshots(lead_id);
create unique index if not exists instagram_snapshots_lead_idx on instagram_snapshots(lead_id);

alter table lead_source_snapshots enable row level security;
alter table website_snapshots enable row level security;
alter table instagram_snapshots enable row level security;

create policy source_snapshots_admin_all on lead_source_snapshots for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy source_snapshots_read_assigned on lead_source_snapshots for select
  using (exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid()));

create policy website_snapshots_admin_all on website_snapshots for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy website_snapshots_read_assigned on website_snapshots for select
  using (exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid()));

create policy instagram_snapshots_admin_all on instagram_snapshots for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy instagram_snapshots_read_assigned on instagram_snapshots for select
  using (exists (select 1 from salon_leads where id = lead_id and assigned_to = auth.uid()));
