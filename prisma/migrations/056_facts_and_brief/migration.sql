-- 056_facts_and_brief — the bot learns from its owner, and hands over a
-- qualified brief instead of a bare name and email.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-055).
--
-- Additive. Two independent things that happen to ship together:
--
-- SiteFact — answers the OWNER wrote, retrieved alongside the crawl and
-- given priority over it. THIS TABLE IS NOT A CACHE: SiteChunk and
-- SiteProduct are wiped and rebuilt on every crawl, SiteFact must survive
-- them forever. It is the only site-knowledge a human authored, and the
-- whole promise of "correct it once and it stays corrected" is that
-- re-scanning the site can never erase it.
--
-- CompanyInquiry.brief — the concierge intake summary (what they want,
-- budget/timeline IF THEY SAID SO, what's still unknown), extracted from
-- the chat when the lead is submitted.

CREATE TABLE IF NOT EXISTS "SiteFact" (
  "id"        TEXT NOT NULL,
  "siteId"    TEXT NOT NULL,
  "question"  TEXT NOT NULL,
  "answer"    TEXT NOT NULL,
  "embedding" vector(1024),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteFact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SiteFact_siteId_idx" ON "SiteFact"("siteId");
DO $$ BEGIN
  ALTER TABLE "SiteFact" ADD CONSTRAINT "SiteFact_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "WidgetSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SiteFact" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "brief" JSONB;
