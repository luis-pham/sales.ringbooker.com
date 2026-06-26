-- Index cho jobs status + created_at
create index if not exists idx_jobs_status_created
  on jobs(status, created_at desc);

-- Index cho jobs type + created_at
create index if not exists idx_jobs_type_created
  on jobs(type, created_at desc);

-- Index cho ringbooker_demos lead_id + last_viewed_at
create index if not exists idx_ringbooker_demos_lead_viewed
  on ringbooker_demos(lead_id, last_viewed_at desc);

-- Index cho outreach_evidence lead_id + created_at
create index if not exists idx_outreach_evidence_lead_created
  on outreach_evidence(lead_id, created_at desc);

-- Index cho follow_ups lead_id + scheduled_for
create index if not exists idx_follow_ups_lead_scheduled
  on follow_ups(lead_id, scheduled_for asc);

-- Index cho demo_sessions started_at (nếu chưa có)
create index if not exists idx_demo_sessions_demo_started
  on demo_sessions(started_at desc);
