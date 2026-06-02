alter table lead_search_runs
  add column if not exists vertical text,
  add column if not exists grid_point text,
  add column if not exists query_variation text,
  add column if not exists grid_index integer default 0,
  add column if not exists grid_total integer default 1;

create index if not exists search_runs_city_vertical_idx
  on lead_search_runs(city, state, vertical, status, created_at desc)
  where status = 'completed';

create index if not exists search_runs_pending_idx
  on lead_search_runs(city, state, vertical, status)
  where status in ('pending', 'running');
