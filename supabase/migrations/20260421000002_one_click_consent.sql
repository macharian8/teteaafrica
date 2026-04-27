-- Sprint 7: One-click send consent toggle
-- Rollback: ALTER TABLE users DROP COLUMN IF EXISTS one_click_consent;

ALTER TABLE users ADD COLUMN IF NOT EXISTS one_click_consent BOOLEAN DEFAULT FALSE;
