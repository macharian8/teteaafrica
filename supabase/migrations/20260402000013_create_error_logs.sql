-- Migration: Create error_logs table
-- Rollback:
--   DROP TABLE IF EXISTS public.error_logs;

CREATE TABLE IF NOT EXISTS public.error_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- error_logs is NOT country-scoped (infrastructure concern)
  error_message TEXT        NOT NULL,
  stack         TEXT,
  context       JSONB       NOT NULL DEFAULT '{}', -- request path, user_id, etc.
  severity      TEXT        NOT NULL DEFAULT 'error'
    CHECK (severity IN ('debug', 'info', 'warning', 'error', 'fatal')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS error_logs_severity_idx    ON public.error_logs (severity);
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx  ON public.error_logs (created_at DESC);

-- RLS: error_logs are service-role only — no user-level access
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- No SELECT policy: only service role (bypasses RLS) can read error logs
-- This prevents leaking stack traces to end users
