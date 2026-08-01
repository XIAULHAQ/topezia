-- 052_site_products — the widget learns whether a site SELLS things.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-051).
--
-- Additive. Products are harvested from the site's own Product JSON-LD
-- during the crawl — WooCommerce, Shopify and friends all emit it — so
-- "is this an ecommerce site" needs no config: products found means yes.
-- Like SiteChunk, this is a cache of their site, wiped on every crawl.

CREATE TABLE IF NOT EXISTS "SiteProduct" (
  "id"          TEXT NOT NULL,
  "siteId"      TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "price"       TEXT,
  "image"       TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "embedding"   vector(1024),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SiteProduct_siteId_idx" ON "SiteProduct"("siteId");
DO $$ BEGIN
  ALTER TABLE "SiteProduct" ADD CONSTRAINT "SiteProduct_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "WidgetSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SiteProduct" ENABLE ROW LEVEL SECURITY;
