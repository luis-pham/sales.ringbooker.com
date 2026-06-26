-- Index thiếu cho outreach_events hot paths
create index if not exists idx_outreach_events_created_by_at
  on outreach_events(created_by, created_at desc);

create index if not exists idx_outreach_events_stage_metadata
  on outreach_events((metadata->>'sales_stage'), created_at desc);

-- RPC 1: Team member stats - thay thế 6 queries × N members
create or replace function get_team_stats(p_week_ago timestamptz)
returns table(
  member_id uuid,
  assigned bigint,
  active bigint,
  converted bigint,
  ghosted bigint,
  dms_sent bigint,
  views bigint
)
language sql
stable
as $$
  select
    p.id as member_id,
    count(distinct l.id) filter (where l.assigned_to = p.id) as assigned,
    count(distinct l.id) filter (where l.assigned_to = p.id and l.sales_stage = any(array['hot','warm','sent','viewed','trial'])) as active,
    count(distinct l.id) filter (where l.assigned_to = p.id and l.sales_stage = 'converted') as converted,
    count(distinct l.id) filter (where l.assigned_to = p.id and l.sales_stage = 'ghosted') as ghosted,
    count(distinct e.id) filter (where e.created_by = p.id and e.metadata->>'sales_stage' = 'sent' and e.created_at >= p_week_ago) as dms_sent,
    count(distinct ds.id) filter (where sl2.assigned_to = p.id and ds.started_at >= p_week_ago) as views
  from profiles p
  left join salon_leads l on l.assigned_to = p.id
  left join outreach_events e on e.created_by = p.id
  left join demo_sessions ds on true
  left join salon_leads sl2 on sl2.id = ds.lead_id and sl2.assigned_to = p.id
  where p.role in ('admin', 'outreacher')
    and p.is_active = true
  group by p.id
$$;

-- RPC 2: 7-day trend - thay thế 21 queries
create or replace function get_trend_7days(p_start timestamptz)
returns table(
  day_date date,
  dms_sent bigint,
  views bigint,
  conversions bigint
)
language sql
stable
as $$
  select
    d::date as day_date,
    count(distinct e.id) filter (
      where e.created_at >= d and e.created_at < d + interval '1 day'
      and e.metadata->>'sales_stage' = 'sent'
    ) as dms_sent,
    count(distinct ds.id) filter (
      where ds.started_at >= d and ds.started_at < d + interval '1 day'
    ) as views,
    count(distinct l.id) filter (
      where l.updated_at >= d and l.updated_at < d + interval '1 day'
      and l.sales_stage = 'converted'
    ) as conversions
  from generate_series(p_start::date, p_start::date + 6, '1 day') as d
  left join outreach_events e on e.created_at >= p_start
  left join demo_sessions ds on ds.started_at >= p_start
  left join salon_leads l on l.updated_at >= p_start and l.sales_stage = 'converted'
  group by d
  order by d
$$;
