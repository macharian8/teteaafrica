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
      url := current_setting('app.webhook_base_url') || '/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
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
      url := current_setting('app.webhook_base_url') || '/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
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
      url := current_setting('app.webhook_base_url') || '/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
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
      url := current_setting('app.webhook_base_url') || '/api/notifications/dispatch',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- ── App settings ─────────────────────────────────────────────────────────────
-- Set base URL and secret for webhook calls from pg_cron.
-- These must be set in Supabase Dashboard → Settings → Vault (or via ALTER DATABASE).
-- Example (run manually after migration):
--
--   ALTER DATABASE postgres
--     SET app.webhook_base_url = 'https://your-deployment-url.com';
--   ALTER DATABASE postgres
--     SET app.scraper_secret = 'your-secret-key';
--
-- IMPORTANT: Do not store secrets in migration files. Set them via the Supabase Vault.
