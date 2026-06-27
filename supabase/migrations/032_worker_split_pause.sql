ALTER TABLE worker_settings
ADD COLUMN IF NOT EXISTS pipeline_paused boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS demo_paused boolean NOT NULL DEFAULT false;

-- Backfill: nếu is_paused = true thì cả 2 cũng true
UPDATE worker_settings
SET
  pipeline_paused = is_paused,
  demo_paused = is_paused;
