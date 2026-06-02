-- Add social URL columns to salon_leads
alter table salon_leads add column if not exists facebook_url text;
alter table salon_leads add column if not exists tiktok_url text;

-- Add social link arrays to website_snapshots
alter table website_snapshots add column if not exists facebook_links text[];
alter table website_snapshots add column if not exists tiktok_links text[];
