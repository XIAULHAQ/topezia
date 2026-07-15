-- Topezia — enable pgvector and add embedding columns.
-- Run this AFTER `prisma migrate dev` has created the base tables,
-- or fold it into your first migration if starting fresh.
-- Supabase: pgvector is available as an extension out of the box.

CREATE EXTENSION IF NOT EXISTS vector;

-- 1536 dims matches most small/medium embedding models. Adjust if you pick
-- a provider with a different output size (check before seeding real data —
-- changing this later means re-embedding everything).

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Approximate nearest-neighbor index. ivfflat needs ANALYZE after enough
-- rows exist (a few thousand) to pick good list counts — fine to add this
-- index empty and let it warm up during Slice 2 ingestion.
CREATE INDEX IF NOT EXISTS job_embedding_idx
  ON "Job" USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
