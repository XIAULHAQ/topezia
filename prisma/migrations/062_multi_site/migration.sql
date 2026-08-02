-- 062_multi_site — a company can run the chat on more than one website.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-061).
--
-- This is what makes the Studio plan deliverable: it was priced for ten
-- sites while the schema allowed one. How many a company may actually run
-- is enforced in code from lib/billing/plans.ts, NOT by the database, so
-- raising a plan's allowance never needs a migration again.
--
-- Leads gain a siteId, because on a ten-site agency account "which of my
-- clients' sites did this come from" is the first question anyone asks.
-- ON DELETE SET NULL: a lead belongs to the COMPANY and must outlive the
-- site it arrived through — removing a website must never delete the
-- business it produced.
--
-- The open-inquiry guard has to move with it. It was one open widget
-- inquiry per (company, email); on a multi-site account that would block
-- someone who wrote to two different clients of the same agency. It is now
-- per (site, email), which is the same rule one level down.

-- 1. One site per company is no longer the rule.
DROP INDEX IF EXISTS "WidgetSite_companyId_key";
CREATE INDEX IF NOT EXISTS "WidgetSite_companyId_idx" ON "WidgetSite"("companyId");

-- 2. Which site a lead came through.
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "siteId" TEXT;
DO $$ BEGIN
  ALTER TABLE "CompanyInquiry" ADD CONSTRAINT "CompanyInquiry_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "WidgetSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "CompanyInquiry_siteId_idx" ON "CompanyInquiry"("siteId");

-- 3. Backfill, while one-site-per-company is still true of the data — after
--    this runs, every existing widget lead knows where it came from.
UPDATE "CompanyInquiry" i
   SET "siteId" = s.id
  FROM "WidgetSite" s
 WHERE i."companyId" = s."companyId"
   AND i.source = 'WIDGET'
   AND i."siteId" IS NULL;

-- 4. Re-key the open-inquiry guard from the company to the site. Done after
--    the backfill so it can't trip over rows that have no site yet.
DROP INDEX IF EXISTS "CompanyInquiry_open_one_per_visitor";
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInquiry_open_one_per_visitor"
    ON "CompanyInquiry"("siteId", "visitorEmail")
 WHERE (status = 'NEW' AND source = 'WIDGET');
