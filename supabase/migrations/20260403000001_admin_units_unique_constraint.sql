-- Migration: Add unique constraint to admin_units for idempotent seeding
-- Rollback:
--   ALTER TABLE public.admin_units
--     DROP CONSTRAINT IF EXISTS admin_units_country_region_unique;

ALTER TABLE public.admin_units
  ADD CONSTRAINT admin_units_country_region_unique
  UNIQUE (country_code, region_level_1, region_level_2);
