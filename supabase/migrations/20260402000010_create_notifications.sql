-- Migration: Create notifications table
-- Rollback:
--   DROP TABLE IF EXISTS public.notifications;
--   DROP TYPE IF EXISTS notification_status_enum;

DO $$ BEGIN
  CREATE TYPE notification_status_enum AS ENUM (
    'queued',
    'sent',
    'delivered',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID                       NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  country_code VARCHAR(2)                 NOT NULL DEFAULT 'KE',
  channel      notification_channel_enum  NOT NULL,
  status       notification_status_enum   NOT NULL DEFAULT 'queued',
  subject      TEXT,
  body         TEXT                       NOT NULL,
  document_id  UUID                       REFERENCES public.documents (id) ON DELETE SET NULL,
  action_id    UUID                       REFERENCES public.actions (id) ON DELETE SET NULL,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx    ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_country_idx    ON public.notifications (country_code);
CREATE INDEX IF NOT EXISTS notifications_status_idx     ON public.notifications (status) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications (created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
