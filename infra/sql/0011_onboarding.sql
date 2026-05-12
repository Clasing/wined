-- 0011_onboarding.sql
-- SOM-10 / Step 50: Onboarding wizard timestamps.
-- onboarding_state JSONB ya existe en 0001_init (línea 34). Aquí solo se añaden
-- los timestamps de inicio/fin para medir time-to-first-value (≤ 15 min) y para
-- el recordatorio cron D3 cuando started_at != NULL y completed_at IS NULL.
-- Idempotente: safe to re-run.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- onboarding_state default ya está en 0001; reaseguramos por si la columna
-- existe sin default (entornos antiguos).
ALTER TABLE organizations
  ALTER COLUMN onboarding_state SET DEFAULT '{}'::jsonb;
