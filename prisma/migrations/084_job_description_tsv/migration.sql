-- Full-text vector for PROJECT descriptions — the skill-hub body matcher.
--
-- lib/seo/hubs.ts matched hub body terms with `descriptionRaw ~* '\y(a|b|..)\y'`
-- over every live project: one regex pass over 7.5k briefs ≈ 400 ms, and
-- pg_trgm cannot index a multi-term alternation tightly (measured: every
-- form returned most projects and rechecked them). A tsvector + GIN answers
-- the same question in ~10 ms with whole-word semantics built in.
--
-- Only PROJECT rows get a vector (jobs match on title only), kept NULL for
-- jobs so the partial GIN index and the column stay small (~10 MB).
--
-- `replace(descriptionRaw, '/', ' ')`: the default parser turns slash-joined
-- tool lists ("Premiere/After Effects", "Canva/CapCut") into single file-path
-- tokens, which broke 15 real matches in testing. With the slash normalised
-- the FTS match is a strict superset of the regex one on live data
-- (806 regex → 814 FTS; the 8 extra are "motion-graphics"-style hyphenations
-- and "UGC/video" that the regex rule's literal space missed).
--
-- A trigger, NOT a GENERATED STORED column: adding a generated column rewrites
-- the whole table and rebuilds every index — including the 99-second HNSW —
-- under ACCESS EXCLUSIVE lock. ADD COLUMN (nullable) is instant; the backfill
-- below runs in batches; the index is built CONCURRENTLY.
--
-- HAND-WRITTEN and applied live step by step, then
-- `prisma migrate resolve --applied 084_job_description_tsv`.
-- schema.prisma carries the column as Unsupported("tsvector") so `migrate
-- diff` does not try to drop it (unlike the embedding columns, see 020).

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "descriptionTsv" tsvector;

CREATE OR REPLACE FUNCTION job_description_tsv_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'PROJECT' THEN
    NEW."descriptionTsv" := to_tsvector('simple', replace(NEW."descriptionRaw", '/', ' '));
  ELSE
    NEW."descriptionTsv" := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS job_description_tsv_sync ON "Job";
CREATE TRIGGER job_description_tsv_sync
  BEFORE INSERT OR UPDATE OF "descriptionRaw", kind ON "Job"
  FOR EACH ROW EXECUTE FUNCTION job_description_tsv_sync();

-- Backfill (run in batches of ~500 ids by the applying script; shown whole here):
UPDATE "Job" SET "descriptionTsv" = to_tsvector('simple', replace("descriptionRaw", '/', ' '))
 WHERE kind = 'PROJECT' AND "descriptionTsv" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS job_project_desc_tsv_idx
  ON "Job" USING gin ("descriptionTsv") WHERE kind = 'PROJECT';
