-- Cập nhật constraint status để include "no_social"
ALTER TABLE salon_leads
DROP CONSTRAINT IF EXISTS salon_leads_status_check;

-- Backfill status cho lead đã score
-- Lead có social + đã score → outreach_ready
UPDATE salon_leads
SET status = 'outreach_ready'
WHERE status IN ('outreach_ready', 'scored')
  AND has_social = true;

-- Lead không có social + đã score → no_social
UPDATE salon_leads
SET status = 'no_social'
WHERE status = 'scored'
  AND has_social = false;

ALTER TABLE salon_leads
ADD CONSTRAINT salon_leads_status_check
CHECK (status IN (
  'new', 'enriching', 'enriched',
  'outreach_ready', 'no_social',
  'dm_sent', 'replied', 'demo_shared',
  'demo_viewed', 'demo_completed',
  'follow_up_needed', 'converted',
  'lost', 'disqualified'
));
