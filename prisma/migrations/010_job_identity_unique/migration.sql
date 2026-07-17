-- One Job row per posting, identified by the source's own stable id rather
-- than by a hash of our normalized description.
--
-- Why: dedup keyed on descriptionHash, so it was a function of our own
-- extraction code. When the Greenhouse entity-decoding fix changed how
-- descriptions normalize, previously-ingested Greenhouse jobs hashed
-- differently, looked new, and were inserted a second time (9% of the live
-- feed). With cron ingesting twice daily, any future normalization change
-- would have done the same to every affected source.
--
-- Pre-existing collisions are cleared by scripts/dedupe-identity.ts, which
-- MUST run before this index is created.
--
-- Postgres treats NULLs as distinct, so rows with a NULL externalId or
-- sourceCompanySlug are not constrained. Every crawler sets externalId today
-- (0 NULLs live); the ingestion code falls back to sourceUrl when it's absent.
CREATE UNIQUE INDEX "Job_source_sourceCompanySlug_externalId_key"
  ON "Job"("source", "sourceCompanySlug", "externalId");
