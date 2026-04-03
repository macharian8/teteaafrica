-- Migration: Create subscriptions table
-- Rollback:
--   DROP TABLE IF EXISTS public.subscriptions;
--   DROP TYPE IF EXISTS notification_channel_enum;

DO $$ BEGIN
  CREATE TYPE notification_channel_enum AS ENUM (
    'whatsapp',
    'sms',
    'email'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID                       NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  country_code         VARCHAR(2)                 NOT NULL DEFAULT 'KE',
  region_l1            TEXT,
  region_l2            TEXT,
  topics               TEXT[]                     NOT NULL DEFAULT '{}',
  channel              notification_channel_enum  NOT NULL DEFAULT 'email',
  language_preference  VARCHAR(5)                 NOT NULL DEFAULT 'en'
    CHECK (language_preference IN ('en', 'sw', 'fr', 'lg', 'rw')),
  is_active            BOOLEAN                    NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx     ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_country_idx     ON public.subscriptions (country_code);
CREATE INDEX IF NOT EXISTS subscriptions_region_l1_idx   ON public.subscriptions (country_code, region_l1);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.uid() = user_id);
