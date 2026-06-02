do $$
begin
  alter table jobs drop constraint if exists jobs_type_check;

  alter table jobs add constraint jobs_type_check
    check (type in (
      'search_run',
      'enrich_lead',
      'enrich_instagram',
      'score_lead',
      'score_batch',
      'auto_create_demo',
      'auto_search_queue',
      'cleanup'
    ));
end $$;
