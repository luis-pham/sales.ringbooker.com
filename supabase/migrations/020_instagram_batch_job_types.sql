-- Add instagram_batch job types to the jobs constraint
alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check check (
  type in (
    'search_run',
    'enrich_lead',
    'enrich_instagram',
    'instagram_batch',
    'instagram_batch_queue',
    'score_lead',
    'score_batch',
    'auto_create_demo',
    'auto_search_queue',
    'cleanup'
  )
);
