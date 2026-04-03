-- Migration: Create law_chunks table with pgvector embedding column
-- Rollback:
--   DROP TABLE IF EXISTS public.law_chunks;
--   DROP FUNCTION IF EXISTS public.match_law_chunks;

CREATE TABLE IF NOT EXISTS public.law_chunks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  VARCHAR(2)  NOT NULL DEFAULT 'KE',
  statute_name  TEXT        NOT NULL,   -- e.g. "Constitution of Kenya 2010"
  section_ref   TEXT,                   -- e.g. "Article 35"
  chunk_text    TEXT        NOT NULL,
  chunk_index   INTEGER     NOT NULL,
  -- 1536-dim embeddings (text-embedding-3-small / ada-002 compatible)
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS law_chunks_country_code_idx ON public.law_chunks (country_code);
CREATE INDEX IF NOT EXISTS law_chunks_statute_idx      ON public.law_chunks (country_code, statute_name);

-- Vector similarity search index (IVFFlat — rebuild after seeding)
-- CREATE INDEX law_chunks_embedding_idx ON public.law_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS
ALTER TABLE public.law_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Law chunks are publicly readable"
  ON public.law_chunks FOR SELECT
  USING (true);

-- Helper function: semantic search filtered by country_code
CREATE OR REPLACE FUNCTION public.match_law_chunks(
  query_embedding vector(1536),
  query_country_code VARCHAR(2),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  country_code VARCHAR(2),
  statute_name TEXT,
  section_ref TEXT,
  chunk_text TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    lc.id,
    lc.country_code,
    lc.statute_name,
    lc.section_ref,
    lc.chunk_text,
    1 - (lc.embedding <=> query_embedding) AS similarity
  FROM public.law_chunks lc
  WHERE
    lc.country_code = query_country_code
    AND lc.embedding IS NOT NULL
    AND 1 - (lc.embedding <=> query_embedding) > match_threshold
  ORDER BY lc.embedding <=> query_embedding
  LIMIT match_count;
$$;
