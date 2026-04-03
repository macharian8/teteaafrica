-- Migration: Create users table (extends Supabase Auth)
-- Rollback:
--   DROP TABLE IF EXISTS public.users;

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email         TEXT,
  phone         TEXT,
  country_code  VARCHAR(2)  NOT NULL DEFAULT 'KE',
  language_preference VARCHAR(5) NOT NULL DEFAULT 'en'
    CHECK (language_preference IN ('en', 'sw', 'fr', 'lg', 'rw')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own row"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own row"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create user profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, phone)
  VALUES (NEW.id, NEW.email, NEW.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
