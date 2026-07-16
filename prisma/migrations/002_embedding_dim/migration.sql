-- Re-dimension embedding columns from vector(1536) to vector(1024).
--
-- 000_init_vector_support created "Job".embedding and "Profile".embedding as
-- vector(1536), but no Voyage model emits 1536 dims (verified live: voyage-3-lite
-- is 512-only; voyage-3.5-lite, the chosen model, outputs 1024). This aligns the
-- columns with lib/ingestion/embed.ts (EMBEDDING_DIM = 1024).
--
-- Safe as a plain ALTER because both tables carry zero embeddings at the time of
-- this migration (Job/Profile empty) — no re-embedding required. If either table
-- already held vectors, this would need a re-embed pass, not a bare type change.

-- The ivfflat index is bound to the column's dimension, so drop it before the
-- type change and rebuild it after.
DROP INDEX IF EXISTS job_embedding_idx;

ALTER TABLE "Job"     ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "Profile" ALTER COLUMN embedding TYPE vector(1024);

CREATE INDEX IF NOT EXISTS job_embedding_idx
  ON "Job" USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
