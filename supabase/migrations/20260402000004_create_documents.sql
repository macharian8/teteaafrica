-- Migration: Create documents table
-- Rollback:
--   DROP TABLE IF EXISTS public.documents;

CREATE TABLE IF NOT EXISTS public.documents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code   VARCHAR(2)  NOT NULL DEFAULT 'KE',
  url            TEXT,
  storage_path   TEXT,                  -- Supabase Storage path for raw PDF/HTML
  raw_text       TEXT,                  -- Extracted plain text
  content_hash   TEXT        UNIQUE,    -- SHA-256 for deduplication
  scraped_at     TIMESTAMPTZ,
  uploaded_by    UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  source         TEXT        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'scraper', 'whatsapp')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_country_code_idx ON public.documents (country_code);
CREATE INDEX IF NOT EXISTS documents_created_at_idx   ON public.documents (created_at DESC);

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read documents"
  ON public.documents FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
