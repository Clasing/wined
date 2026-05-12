-- 0010_kb_preference.sql
-- NUC-13: Conflict resolution KB privada vs global.
-- Promote organizations.kb_preference from text to a typed enum.
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE kb_preference AS ENUM ('private_first', 'global_first', 'show_both');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- If the column is still TEXT (initial seed in 0001), convert it. If already
-- of type kb_preference, this block is a no-op.
DO $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'organizations'
    AND column_name = 'kb_preference';

  IF current_type = 'text' THEN
    -- Drop existing default first so the cast can change type cleanly.
    ALTER TABLE organizations ALTER COLUMN kb_preference DROP DEFAULT;
    ALTER TABLE organizations
      ALTER COLUMN kb_preference TYPE kb_preference
      USING kb_preference::kb_preference;
    ALTER TABLE organizations
      ALTER COLUMN kb_preference SET DEFAULT 'private_first'::kb_preference;
    ALTER TABLE organizations ALTER COLUMN kb_preference SET NOT NULL;
  END IF;
END $$;

-- For environments where the column did not exist at all.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS kb_preference kb_preference NOT NULL DEFAULT 'private_first';
