-- Per-stage lead counts for the CRM summary strip — counts the WHOLE table
-- (not capped at the 200-row CRM fetch). Role scope is passed in: null = all leads,
-- otherwise restrict to a rep's assigned leads.

create or replace function get_sales_stage_counts(p_assigned_to uuid default null)
returns table(stage text, n bigint)
language sql
stable
as $$
  select coalesce(sales_stage, 'ready') as stage, count(*)::bigint as n
  from salon_leads
  where p_assigned_to is null or assigned_to = p_assigned_to
  group by 1
$$;
