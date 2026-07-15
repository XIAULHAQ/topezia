-- Enables trigram similarity matching, used by dedupe.ts for fuzzy title
-- comparison (spec §4.3, rule b: "same company_domain + fuzzy title +
-- same location"). Supabase supports pg_trgm out of the box.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS job_title_trgm_idx
  ON "Job" USING gin ("titleRaw" gin_trgm_ops);
