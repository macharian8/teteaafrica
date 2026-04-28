CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  source TEXT DEFAULT 'landing'
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join waitlist" ON waitlist;
CREATE POLICY "Anyone can join waitlist"
ON waitlist FOR INSERT WITH CHECK (true);