-- Migration: Create deadlines table
-- Rollback:
--   DROP TABLE IF EXISTS public.deadlines;

CREATE TABLE IF NOT EXISTS public.deadlines (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  document_id   UUID        REFERENCES public.documents (id) ON DELETE SET NULL,
  action_id     UUID        REFERENCES public.actions (id) ON DELETE SET NULL,
  country_code  VARCHAR(2)  NOT NULL DEFAULT 'KE',
  label         TEXT        NOT NULL,
  deadline_date DATE        NOT NULL,
  is_dismissed  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Notification tracking: which reminder windows have fired
  notified_7d   BOOLEAN     NOT NULL DEFAULT FALSE,
  notified_3d   BOOLEAN     NOT NULL DEFAULT FALSE,
  notified_1d   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deadlines_user_id_idx      ON public.deadlines (user_id);
CREATE INDEX IF NOT EXISTS deadlines_deadline_date_idx ON public.deadlines (deadline_date) WHERE is_dismissed = FALSE;
CREATE INDEX IF NOT EXISTS deadlines_country_idx       ON public.deadlines (country_code);

-- RLS
ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own deadlines"
  ON public.deadlines FOR ALL
  USING (auth.uid() = user_id);
