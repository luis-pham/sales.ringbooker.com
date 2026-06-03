-- Review activity signals fetched from Serper reviews endpoint (gated to promising leads)
alter table salon_leads add column if not exists last_review_at timestamptz;
alter table salon_leads add column if not exists owner_responds_reviews boolean not null default false;
