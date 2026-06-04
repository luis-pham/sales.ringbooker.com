-- Speed up the CRM lead list (/api/sales/leads), which orders by updated_at desc
-- on every request. Without an index Postgres sorts the whole table each time.

-- Admin view: global "most recently touched" ordering.
create index if not exists leads_updated_at_idx
  on salon_leads(updated_at desc);

-- Rep view: list is filtered by assigned_to then ordered by updated_at desc.
-- A composite index serves the filter + sort in one pass.
create index if not exists leads_assigned_updated_idx
  on salon_leads(assigned_to, updated_at desc);
