-- Per-page aggregate stats (SEO addendum §2, market-signals spec §2).
--
-- Additive and inert: CREATE TABLE touches no existing row, takes no lock on
-- "Job", and is reversible with DROP TABLE. Nothing reads it until the SEO
-- stats blocks ship, so applying this ahead of the consumer is safe.
--
-- Keyed by "pageKey" (canonical path) rather than a composite of
-- role/vertical/state/country: Postgres treats NULLs as distinct in a unique
-- index, so a composite key over nullable scope columns would silently allow
-- duplicate rows for the same page and break the upsert this table depends on.

CREATE TABLE IF NOT EXISTS "PageStats" (
  "id"               TEXT NOT NULL,
  "pageKey"          TEXT NOT NULL,
  "scopeType"        TEXT NOT NULL,
  "listingCount"     INTEGER NOT NULL,
  "companyCount"     INTEGER NOT NULL,
  "payType"          TEXT,
  "medianPay"        INTEGER,
  "p25Pay"           INTEGER,
  "p75Pay"           INTEGER,
  "paySampleSize"    INTEGER NOT NULL DEFAULT 0,
  "topSkills"        JSONB NOT NULL,
  "empTypeBreakdown" JSONB NOT NULL,
  "remoteShare"      INTEGER NOT NULL,
  "postedLast7d"     INTEGER NOT NULL,
  "computedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PageStats_pageKey_key" ON "PageStats"("pageKey");
CREATE INDEX IF NOT EXISTS "PageStats_scopeType_idx" ON "PageStats"("scopeType");
CREATE INDEX IF NOT EXISTS "PageStats_computedAt_idx" ON "PageStats"("computedAt");
