-- Migration: Create action_executions table
-- Rollback:
--   DROP TABLE IF EXISTS public.action_executions;
--   DROP TYPE IF EXISTS execution_status_enum;

DO $$ BEGIN
  CREATE TYPE execution_status_enum AS ENUM (
    'pending',
    'draft_shown',
    'confirmed',
    'submitted',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.action_executions (
  id              UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       UUID                   NOT NULL REFERENCES public.actions (id) ON DELETE CASCADE,
  user_id         UUID                   NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  country_code    VARCHAR(2)             NOT NULL DEFAULT 'KE',
  status          execution_status_enum  NOT NULL DEFAULT 'pending',
  draft_content   TEXT,                  -- Final content shown/submitted (may differ from action template)
  reference_id    TEXT,                  -- External reference (e.g. ATI request number)
  error_message   TEXT,
  executed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_execs_user_id_idx    ON public.action_executions (user_id);
CREATE INDEX IF NOT EXISTS action_execs_action_id_idx  ON public.action_executions (action_id);
CREATE INDEX IF NOT EXISTS action_execs_country_idx    ON public.action_executions (country_code);

-- RLS
ALTER TABLE public.action_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own executions"
  ON public.action_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own executions"
  ON public.action_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own executions"
  ON public.action_executions FOR UPDATE
  USING (auth.uid() = user_id);
