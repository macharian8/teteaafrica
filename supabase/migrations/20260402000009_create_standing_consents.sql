-- Migration: Create standing_consents table
-- Rollback:
--   DROP TABLE IF EXISTS public.standing_consents;

CREATE TABLE IF NOT EXISTS public.standing_consents (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID             NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  country_code VARCHAR(2)       NOT NULL DEFAULT 'KE',
  action_type  action_type_enum NOT NULL,
  granted_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  UNIQUE (user_id, country_code, action_type)
);

CREATE INDEX IF NOT EXISTS standing_consents_user_id_idx ON public.standing_consents (user_id);

-- RLS
ALTER TABLE public.standing_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own standing consents"
  ON public.standing_consents FOR ALL
  USING (auth.uid() = user_id);
