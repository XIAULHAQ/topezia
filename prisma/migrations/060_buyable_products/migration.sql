-- 060_buyable_products — the chat can hand a visitor to a filled checkout.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-059).
--
-- Additive. WE NEVER TAKE THE MONEY. The visitor is sent to the store's own
-- checkout with the item already in the cart, and pays the merchant there —
-- their tax, their shipping, their stock, their receipt, their refund. No
-- card data comes near us and no Stripe Connect is required.
--
-- externalId  the store's own product id (WooCommerce post id), read from
--             the product page's own markup — no plugin or merchant action.
-- variations  the purchasable options as
--             [{ id, label, price, attributes: {name: value} }]. A "From
--             $150" product is three real prices behind one page, and the
--             visitor has to pick one before a checkout link means anything.
-- buyable     purchasable AND in stock at crawl time. False disables the
--             button rather than sending someone to a dead checkout.
--
-- checkoutPath is per-site because the slug is customisable; detected from
-- the store's own links, defaulting to /checkout/.

ALTER TABLE "SiteProduct" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "SiteProduct" ADD COLUMN IF NOT EXISTS "variations" JSONB;
ALTER TABLE "SiteProduct" ADD COLUMN IF NOT EXISTS "buyable"    BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "checkoutPath" TEXT;
