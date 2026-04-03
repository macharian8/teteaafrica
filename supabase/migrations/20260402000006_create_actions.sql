-- Migration: Create actions table
-- Rollback:
--   DROP TABLE IF EXISTS public.actions;
--   DROP TYPE IF EXISTS action_type_enum;
--   DROP TYPE IF EXISTS executability_enum;

DO $$ BEGIN
  CREATE TYPE action_type_enum AS ENUM (
    'ati_request',
    'petition',
    'calendar_invite',
    'submission',
    'complaint_anticorruption',
    'complaint_ombudsman',
    'environment_objection',
    'representative_contact',
    'media_pitch',
    'inform_only'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE executability_enum AS ENUM (
    'auto',
    'scaffolded',
    'inform_only'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.actions (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id       UUID              NOT NULL REFERENCES public.document_analyses (id) ON DELETE CASCADE,
  country_code      VARCHAR(2)        NOT NULL DEFAULT 'KE',
  action_type       action_type_enum  NOT NULL,
  executability     executability_enum NOT NULL DEFAULT 'inform_only',
  title_en          TEXT              NOT NULL,
  title_sw          TEXT,
  description_en    TEXT,
  description_sw    TEXT,
  legal_basis       TEXT,
  draft_content_en  TEXT,
  draft_content_sw  TEXT,
  deadline          DATE,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS actions_analysis_id_idx  ON public.actions (analysis_id);
CREATE INDEX IF NOT EXISTS actions_country_code_idx ON public.actions (country_code);
CREATE INDEX IF NOT EXISTS actions_deadline_idx     ON public.actions (deadline) WHERE deadline IS NOT NULL;

-- RLS
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read actions"
  ON public.actions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert actions"
  ON public.actions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
