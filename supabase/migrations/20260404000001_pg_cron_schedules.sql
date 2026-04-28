-- Migration: Set up pg_cron schedules for automated scrapers
-- Requires: pg_cron extension enabled in Supabase project settings
--           (Dashboard → Database → Extensions → pg_cron)
--
-- Rollback:
--   SELECT cron.unschedule('tetea-gazette-scraper');
--   SELECT cron.unschedule('tetea-nairobi-county-scraper');
--   SELECT cron.unschedule('tetea-parliament-scraper');
--   SELECT cron.unschedule('tetea-notification-dispatcher');

-- Enable pg_cron extension (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role (required by Supabase)
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── Remove existing schedules (idempotent) ───────────────────────────────────
-- Using DO block to avoid errors if cron jobs don't exist yet
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

-- ── Schedule: Kenya Gazette scraper ─────────────────────────────────────────
-- Fridays at 08:00 EAT = 05:00 UTC
-- Cron: minute hour day-of-month month day-of-week
-- Friday = 5 in cron (0=Sunday)
SELECT cron.schedule(
  'tetea-gazette-scraper',
  '0 5 * * 5',   -- Every Friday at 05:00 UTC (08:00 EAT)
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{"scraper": "gazette", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Nairobi County scraper ────────────────────────────────────────
-- Daily at 07:00 EAT = 04:00 UTC
SELECT cron.schedule(
  'tetea-nairobi-county-scraper',
  '0 4 * * *',   -- Every day at 04:00 UTC (07:00 EAT)
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{"scraper": "county-nairobi", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Parliament scraper ─────────────────────────────────────────────
-- Daily at 07:00 EAT = 04:00 UTC (offset by 15 min from county scraper)
SELECT cron.schedule(
  'tetea-parliament-scraper',
  '15 4 * * *',  -- Every day at 04:15 UTC (07:15 EAT)
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{"scraper": "parliament", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Notification dispatcher ───────────────────────────────────────
-- Runs every 5 minutes to process queued notifications
-- In Sprint 4, this will call the actual send functions
SELECT cron.schedule(
  'tetea-notification-dispatcher',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://dev.tetea.africa/api/notifications/dispatch',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scraper_secret' LIMIT 1))::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- ── App settings ─────────────────────────────────────────────────────────────
-- webhook_base_url: hardcoded above as 'https://dev.tetea.africa' (not sensitive).
-- scraper_secret:   read from Supabase Vault via vault.decrypted_secrets.
--
-- One-time setup: insert the secret into Vault before the cron jobs run.
-- Run in Supabase Studio → SQL Editor:
--
--   SELECT vault.create_secret(
--     '<your-scraper-secret-value>',
--     'scraper_secret',
--     'pg_cron webhook auth for /api/scrapers/run and /api/notifications/dispatch'
--   );
--
-- To rotate later:
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'scraper_secret'),
--     '<new-value>'
--   );
