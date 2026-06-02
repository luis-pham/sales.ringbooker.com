-- Add facebook_url to salon_leads
alter table salon_leads add column if not exists facebook_url text;

-- Add facebook_links to website_snapshots
alter table website_snapshots add column if not exists facebook_links text[];
