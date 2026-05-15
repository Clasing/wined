-- 0017_jwt_auth.sql
-- Replace Clerk bridge columns with native JWT-based auth.
-- NOTE: no explicit BEGIN/COMMIT — postgres.js (the runtime migrator's driver)
-- disallows transaction control inside its raw multi-statement path.
-- Each statement runs in its own implicit transaction. All are idempotent
-- (IF EXISTS / IF NOT EXISTS) so re-running is safe.

-- ===== USERS =====
ALTER TABLE users
  DROP COLUMN IF EXISTS clerk_user_id;

-- email already exists per current schema, but ensure present + not null.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT 'placeholder',
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE users ALTER COLUMN email DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email));

-- ===== ORGANIZATIONS =====
ALTER TABLE organizations
  DROP COLUMN IF EXISTS clerk_org_id;

CREATE INDEX IF NOT EXISTS idx_orgs_name ON organizations (name);

-- ===== REFRESH TOKENS =====
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id, revoked_at);
