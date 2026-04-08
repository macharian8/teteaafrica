-- Migration: Codify public read RLS policies for feed tables
-- These policies were added manually in production — this migration makes them idempotent.
--
-- Rollback:
--   DROP POLICY IF EXISTS "Public can read documents" ON documents;
--   DROP POLICY IF EXISTS "Public can read analyses" ON document_analyses;
--   DROP POLICY IF EXISTS "Public can read actions" ON actions;
--   DROP POLICY IF EXISTS "Public can read action_executions count" ON action_executions;

DO $$ BEGIN
  CREATE POLICY "Public can read documents"
    ON documents FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public can read analyses"
    ON document_analyses FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public can read actions"
    ON actions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public can read action_executions count"
    ON action_executions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
