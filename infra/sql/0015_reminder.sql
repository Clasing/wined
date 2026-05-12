-- 0015_reminder.sql
-- Step 83: Onboarding reminder D3.
-- Tracks last time we sent an onboarding reminder to admins of an org, so the
-- daily cron can throttle (re-send only after 7d) and avoid spamming.
-- Idempotent: safe to re-run.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
