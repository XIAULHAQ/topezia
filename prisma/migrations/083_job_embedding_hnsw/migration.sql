-- HNSW index for Job.embedding — the one the match query can actually use.
--
-- 082 dropped the ivfflat index (212 MB, idx_scan = 0). The match query was
-- already a brute-force scan over ~25k 1024-dim vectors: pg_stat_statements
-- mean 3.1 s, max 25 s. Two things stopped the old index from ever helping:
--   1. The ORDER BY referenced a joined row (`j.embedding <=> p.embedding`
--      with CROSS JOIN "Profile" p). Postgres only takes a vector index path
--      for `col <=> <literal/param>`. lib/matching/match.ts now fetches the
--      profile vector first and binds it as a parameter.
--   2. ivfflat built on an empty table has meaningless centroids.
--
-- halfvec: the index stores 2-byte floats (~55 MB instead of ~110 MB for
-- 25k rows — we are on a 500 MB plan) with negligible recall loss. Queries
-- must ORDER BY `embedding::halfvec(1024) <=> $1::halfvec(1024)` for the
-- planner to match this expression index; exact similarity for the returned
-- rows is still computed from the full vector in the SELECT list.
--
-- Filtered queries (status/kind/eligibility) use pgvector >= 0.8's
-- `hnsw.iterative_scan = relaxed_order` (set per-transaction in match.ts) so
-- the scan keeps going until LIMIT is satisfied instead of returning the few
-- survivors of the first ef_search candidates.
--
-- HAND-WRITTEN, applied live with CREATE INDEX CONCURRENTLY (cannot run in a
-- transaction, so not via `migrate deploy` anyway), then
-- `prisma migrate resolve --applied 083_job_embedding_hnsw`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_embedding_hnsw_idx
  ON "Job" USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
