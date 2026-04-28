-- Migration: Re-schedule pg_cron jobs to read scraper_secret from Vault and
-- use a hardcoded webhook_base_url instead of current_setting() database GUCs.
--
-- Background:
--   The cron jobs were originally written to read both base URL and secret via
--   current_setting('app.webhook_base_url') / current_setting('app.scraper_secret'),
--   which require ALTER DATABASE postgres SET — that needs superuser, which the
--   Supabase Cloud `postgres` role does not have. Vault avoids the privilege
--   problem and is the documented place for secrets on Supabase.
--
-- Prerequisite (run once in Supabase Studio → SQL Editor before this migration
-- takes effect, or the cron HTTP calls will send "Bearer NULL"):
--
--   SELECT vault.create_secret(
--     '<scraper-secret-value-from-.env.local>',
--     'scraper_secret',
--     'pg_cron webhook auth for /api/scrapers/run and /api/notifications/dispatch'
--   );
--
-- Rollback:
--   SELECT cron.unschedule('tetea-gazette-scraper');
--   SELECT cron.unschedule('tetea-nairobi-county-scraper');
--   SELECT cron.unschedule('tetea-parliament-scraper');
--   SELECT cron.unschedule('tetea-notification-dispatcher');
--   -- Then re-apply 20260408000001_update_cron_schedules.sql to restore the
--   -- previous current_setting()-based definitions.

-- ── Drop existing schedules (idempotent) ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tetea-gazette-scraper') THEN
    PERFORM cron.unschedule('tetea-gazette-scraper');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tetea-nairobi-county-scraper') THEN
    PERFORM cron.unschedule('tetea-nairobi-county-scraper');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tetea-parliament-scraper') THEN
    PERFORM cron.unschedule('tetea-parliament-scraper');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tetea-notification-dispatcher') THEN
    PERFORM cron.unschedule('tetea-notification-dispatcher');
  END IF;
END $$;

-- ── Schedule: Kenya Gazette — daily at 07:00 EAT (04:00 UTC) ───────────────
SELECT cron.schedule(
  'tetea-gazette-scraper',
  '0 4 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{"scraper": "gazette", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Nairobi County — every 2 days at 07:30 EAT (04:30 UTC) ──────
SELECT cron.schedule(
  'tetea-nairobi-county-scraper',
  '30 4 */2 * *',
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{"scraper": "county-nairobi", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Parliament — every 2 days at 08:00 EAT (05:00 UTC) ───────────
SELECT cron.schedule(
  'tetea-parliament-scraper',
  '0 5 */2 * *',
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{"scraper": "parliament", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Notification dispatcher — every 5 minutes ────────────────────
SELECT cron.schedule(
  'tetea-notification-dispatcher',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/notifications/dispatch',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{}'::jsonb
    );
  $$
);
