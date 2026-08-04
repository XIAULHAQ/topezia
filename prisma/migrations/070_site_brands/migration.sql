-- 070_site_brands — a brand is a set of domains that share one knowledge base.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-069).
--
-- WHY THIS EXISTS. Retrieval is scoped to ONE siteId — chunks, products and
-- taught answers all filter on it. So a business with its marketing site on
-- WordPress and its shop on Shopify gets two bots that know nothing about each
-- other: the site's bot cannot name a product, the shop's bot cannot quote the
-- FAQ. That is the commonest shape of a small business and we serve it badly.
--
-- WHY NOT JUST SCOPE BY COMPANY. Because Studio sells TEN domains to agencies.
-- Pooling everything a company owns would let one client's chat answer with
-- another client's content — a leak with a customer's name on it. So the
-- boundary is explicit and owned: a brand groups the domains that really are
-- one business, and an agency has several brands under one company.
--
-- Brands are NOT a billing unit. Domains are what we count (Brandon, 2026-08-03:
-- "each subdomain should be counted as a site... it will be counted as 5
-- domains"). This table only decides what shares knowledge.
--
-- Additive, and safe to run twice. Every existing company with at least one
-- website gets exactly one brand named after it, holding all of its sites, so
-- behaviour is unchanged on the day it lands: one brand, one site, retrieval
-- resolves to the same single id it does today.

CREATE TABLE IF NOT EXISTS "SiteBrand" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteBrand_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "SiteBrand"
    ADD CONSTRAINT "SiteBrand_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "SiteBrand_companyId_idx" ON "SiteBrand"("companyId");

-- NULLable: a site with no brand is its own island, which is exactly the
-- behaviour we have today and the safe reading if a backfill ever misses one.
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "brandId" TEXT;

DO $$ BEGIN
  ALTER TABLE "WidgetSite"
    ADD CONSTRAINT "WidgetSite_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "SiteBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "WidgetSite_brandId_idx" ON "WidgetSite"("brandId");

-- ── Backfill: one brand per company that has any website ──────────────────
INSERT INTO "SiteBrand" ("id", "companyId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", c."name", now(), now()
  FROM "Company" c
 WHERE EXISTS (SELECT 1 FROM "WidgetSite" s WHERE s."companyId" = c."id")
   AND NOT EXISTS (SELECT 1 FROM "SiteBrand" b WHERE b."companyId" = c."id");

UPDATE "WidgetSite" s
   SET "brandId" = b."id"
  FROM "SiteBrand" b
 WHERE b."companyId" = s."companyId"
   AND s."brandId" IS NULL;
