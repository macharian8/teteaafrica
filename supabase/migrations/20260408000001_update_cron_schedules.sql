-- Migration: Update pg_cron schedules for pipeline-integrated scrapers
-- Now scrapers run more frequently and trigger the full pipeline (scrape + analyze).
--
-- Rollback:
--   SELECT cron.unschedule('tetea-gazette-scraper');
--   SELECT cron.unschedule('tetea-nairobi-county-scraper');
--   SELECT cron.unschedule('tetea-parliament-scraper');
--   -- Then re-apply 20260404000001_pg_cron_schedules.sql for old schedules

-- ── Remove existing schedules (idempotent) ───────────────────────────────────
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
END $$;

-- ── Schedule: Kenya Gazette — daily at 07:00 EAT (04:00 UTC) ───────────────
SELECT cron.schedule(
  'tetea-gazette-scraper',
  '0 4 * * *',   -- Daily at 04:00 UTC (07:00 EAT)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.webhook_base_url') || '/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
      body := '{"scraper": "gazette", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Nairobi County — every 2 days at 07:30 EAT (04:30 UTC) ──────
SELECT cron.schedule(
  'tetea-nairobi-county-scraper',
  '30 4 */2 * *', -- Every 2 days at 04:30 UTC (07:30 EAT)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.webhook_base_url') || '/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
      body := '{"scraper": "county-nairobi", "country": "KE"}'::jsonb
    );
  $$
);

-- ── Schedule: Parliament — every 2 days at 08:00 EAT (05:00 UTC) ───────────
SELECT cron.schedule(
  'tetea-parliament-scraper',
  '0 5 */2 * *',  -- Every 2 days at 05:00 UTC (08:00 EAT)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.webhook_base_url') || '/api/scrapers/run',
      headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.scraper_secret'))::jsonb,
      body := '{"scraper": "parliament", "country": "KE"}'::jsonb
    );
  $$
);
