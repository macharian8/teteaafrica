-- Sprint 7: Onboarding + account columns on users table
-- Rollback: ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed, DROP COLUMN IF EXISTS full_name, DROP COLUMN IF EXISTS national_id, DROP COLUMN IF EXISTS ward;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS national_id TEXT,
  ADD COLUMN IF NOT EXISTS ward TEXT;

CREATE INDEX IF NOT EXISTS idx_users_onboarding_incomplete
  ON users (id) WHERE onboarding_completed = FALSE;
