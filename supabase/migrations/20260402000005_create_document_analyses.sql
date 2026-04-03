-- Migration: Create document_analyses table
-- Rollback:
--   DROP TABLE IF EXISTS public.document_analyses;

DO $$ BEGIN
  CREATE TYPE document_type_enum AS ENUM (
    'gazette_notice',
    'county_policy',
    'parliamentary_bill',
    'budget',
    'tender',
    'nema',
    'land',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.document_analyses (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          UUID         NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  country_code         VARCHAR(2)   NOT NULL DEFAULT 'KE',
  document_type        document_type_enum,
  summary_en           TEXT,
  summary_sw           TEXT,
  affected_region_l1   TEXT[],
  affected_region_l2   TEXT[],
  key_dates            JSONB        NOT NULL DEFAULT '[]',
  analysis_json        JSONB        NOT NULL DEFAULT '{}',
  confidence_score     NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
  needs_review         BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS doc_analyses_document_id_idx  ON public.document_analyses (document_id);
CREATE INDEX IF NOT EXISTS doc_analyses_country_code_idx ON public.document_analyses (country_code);
CREATE INDEX IF NOT EXISTS doc_analyses_needs_review_idx ON public.document_analyses (needs_review) WHERE needs_review = TRUE;

-- RLS
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read analyses"
  ON public.document_analyses FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert analyses"
  ON public.document_analyses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
