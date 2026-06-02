create table if not exists salon_leads (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid references lead_search_runs(id) on delete set null,
  name text not null,
  phone text,
  website_url text,
  instagram_url text,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  google_place_id text unique,
  google_maps_url text,
  rating numeric(3, 1) check (rating between 0 and 5),
  review_count integer default 0,
  categories text[],
  hours_raw jsonb,
  is_open_sunday boolean,
  closes_before_6pm boolean,
  has_website boolean generated always as (website_url is not null) stored,
  has_phone boolean generated always as (phone is not null) stored,
  status text not null default 'new' check (status in (
    'new', 'enriching', 'enriched', 'scored', 'outreach_ready',
    'dm_sent', 'replied', 'demo_shared', 'demo_viewed', 'demo_completed',
    'follow_up_needed', 'converted', 'lost', 'disqualified'
  )),
  assigned_to uuid references profiles(id) on delete set null,
  enriched_at timestamptz,
  scored_at timestamptz,
  last_outreach_at timestamptz,
  converted_at timestamptz,
  notes text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists salon_leads_updated_at on salon_leads;
create trigger salon_leads_updated_at
  before update on salon_leads
  for each row execute function update_updated_at();

alter table salon_leads enable row level security;

create policy leads_admin_all
  on salon_leads for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy leads_outreacher_assigned
  on salon_leads for select
  using (
    assigned_to = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy leads_outreacher_update_assigned
  on salon_leads for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

create index if not exists leads_status_idx on salon_leads(status);
create index if not exists leads_assigned_idx on salon_leads(assigned_to);
create index if not exists leads_city_idx on salon_leads(city);
create index if not exists leads_search_run_idx on salon_leads(search_run_id);
create index if not exists leads_rating_idx on salon_leads(rating desc);
create index if not exists leads_created_at_idx on salon_leads(created_at desc);
