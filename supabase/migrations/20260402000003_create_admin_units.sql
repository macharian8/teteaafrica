-- Migration: Create admin_units table
-- Rollback:
--   DROP TABLE IF EXISTS public.admin_units;

CREATE TABLE IF NOT EXISTS public.admin_units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code      VARCHAR(2)  NOT NULL DEFAULT 'KE',
  region_level_1    TEXT        NOT NULL, -- e.g. County (KE), Region (TZ)
  region_level_2    TEXT,                 -- e.g. Ward (KE), District (TZ)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_units_country_code_idx ON public.admin_units (country_code);
CREATE INDEX IF NOT EXISTS admin_units_region_l1_idx    ON public.admin_units (country_code, region_level_1);

-- RLS
ALTER TABLE public.admin_units ENABLE ROW LEVEL SECURITY;

-- Admin units are public read-only data
CREATE POLICY "Admin units are publicly readable"
  ON public.admin_units FOR SELECT
  USING (true);
