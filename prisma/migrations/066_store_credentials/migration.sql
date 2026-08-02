-- 066_store_credentials — read-only access to a merchant's orders, so a
-- visitor can ask "where is my order?" and get a real answer.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-065).
--
-- A SEPARATE TABLE, not columns on WidgetSite. These are the most sensitive
-- values this product has ever been handed — keys that read someone's orders,
-- with their customers' names and addresses behind them. Keeping them out of
-- WidgetSite means they cannot be picked up by an existing `select`, returned
-- by an existing endpoint, or logged by an existing debug line. Reaching them
-- has to be deliberate.
--
-- `secret` holds an AES-256-GCM blob (lib/crypto/secrets.ts), never plaintext,
-- and the shape inside differs per platform. `lastError` is what the owner is
-- shown when a connection stops working — a store whose key was revoked
-- should say so on the settings page, not fail silently at a customer.
--
-- Additive. Order lookup is off until a site is actually connected.

CREATE TABLE IF NOT EXISTS "SiteStoreCredential" (
  "id"            TEXT PRIMARY KEY,
  -- One connected store per site. A site IS a store.
  "siteId"        TEXT NOT NULL UNIQUE REFERENCES "WidgetSite"("id") ON DELETE CASCADE,
  -- 'woocommerce' | 'shopify' | 'bigcommerce'
  "platform"      TEXT NOT NULL,
  "secret"        TEXT NOT NULL,
  -- Recognisable, unusable: the last four of the key, for the settings page.
  "hint"          TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Off unless the owner turns it on, even once a store is connected:
-- connecting and publishing are two different decisions.
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "orderLookup" BOOLEAN NOT NULL DEFAULT false;
