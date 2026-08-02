-- 061_store_kind — which shop software a site runs, so the chat can build
-- the right kind of checkout link.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-060).
--
-- Additive. "woocommerce" | "shopify" | NULL, detected during the crawl.
-- The two platforms hand off to checkout completely differently:
--   woocommerce  /checkout/?add-to-cart=ID&variation_id=V&attribute_x=Y
--   shopify      /cart/VARIANT:1        (goes straight to checkout)
-- so the link builder has to know which it is talking to.

ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "storeKind" TEXT;
