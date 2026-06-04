-- Demo QA workflow + a 'failed' status for demos whose RingBooker API call
-- returned no usable URL. Demos are now created in a nightly window (US asleep)
-- ahead of assignment; the assigned rep must verify demo quality before sending.

-- 1. Allow demos to be marked 'failed' (output validation) so they're excluded
--    from assignment instead of being shipped broken.
alter table ringbooker_demos
  drop constraint if exists ringbooker_demos_status_check;

alter table ringbooker_demos
  add constraint ringbooker_demos_status_check
  check (status in ('prepared', 'shared', 'viewed', 'completed', 'expired', 'failed'));

-- 2. Rep-side quality check: stamped when the assigned rep confirms the demo is
--    good, right before sending the DM. Gates the ready -> sent transition.
alter table ringbooker_demos
  add column if not exists qa_checked_at timestamptz,
  add column if not exists qa_checked_by uuid references profiles(id) on delete set null;
