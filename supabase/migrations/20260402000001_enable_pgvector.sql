-- Migration: Enable pgvector extension
-- Rollback: DROP EXTENSION IF EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;
