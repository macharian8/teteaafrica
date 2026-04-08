-- Sprint 4: notification delivery columns
--
-- 1. notifications.external_id  — provider message ID (AT, Resend) for receipt matching
-- 2. users.google_access_token  — Google OAuth access token (encrypted at app layer in prod)
-- 3. users.google_refresh_token — Google OAuth refresh token
-- 4. users.google_token_expiry  — expiry timestamp for the access token
--
-- Rollback:
--   ALTER TABLE notifications DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE users DROP COLUMN IF EXISTS google_access_token;
--   ALTER TABLE users DROP COLUMN IF EXISTS google_refresh_token;
--   ALTER TABLE users DROP COLUMN IF EXISTS google_token_expiry;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS external_id TEXT;        -- provider message/email ID

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expiry  TIMESTAMPTZ;

-- Index for receipt webhook lookup
CREATE INDEX IF NOT EXISTS idx_notifications_external_id
  ON notifications (external_id)
  WHERE external_id IS NOT NULL;
