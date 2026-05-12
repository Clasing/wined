-- 0012_msg_fts.sql
-- Step 82 (NUC-11): NL2query full-text search on messages.content.
-- Adds language-aware tsvector GIN indexes (spanish + english) on top of the
-- existing 'simple' idx_msg_fts (kept for backwards compatibility).
-- messages.content is jsonb; coerce to text for FTS.
-- Idempotent: safe to re-run.

CREATE INDEX IF NOT EXISTS idx_msg_fts_es
  ON messages
  USING gin (to_tsvector('spanish', COALESCE(content::text, '')));

CREATE INDEX IF NOT EXISTS idx_msg_fts_en
  ON messages
  USING gin (to_tsvector('english', COALESCE(content::text, '')));
