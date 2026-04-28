-- Add page_count to documents table
-- Rollback: ALTER TABLE documents DROP COLUMN IF EXISTS page_count;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS page_count INTEGER;
