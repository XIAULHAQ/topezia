-- 068_plugin_key — a credential the WordPress plugin can actually READ with.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-067).
--
-- WHY THIS EXISTS. WidgetSite.siteToken is PUBLIC — it sits in the page
-- source of every visitor's browser. It identifies a site; it authorizes
-- nothing. So the plugin cannot use it to ask "how many leads did I get this
-- month?" without publishing that answer to anyone who views source.
--
-- The plugin therefore gets its own secret, minted at the end of the connect
-- handshake and stored only as a SHA-256. It grants exactly one thing: read
-- the counts for this one site. It cannot change settings, read a lead's
-- contents, or touch another site.
--
-- Nullable, and null means "no plugin connected" — which is the state of
-- every site that exists today and of every site set up by hand. Disconnect
-- sets it back to NULL, and that is a real revocation rather than a flag.
--
-- Additive.

ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "pluginKeyHash" TEXT;
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "pluginConnectedAt" TIMESTAMP(3);
-- What the plugin last told us about itself (WP/PHP/plugin version, whether
-- WooCommerce is active). Support triage, and it is how the settings page can
-- say "connected via WordPress" rather than guessing.
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "pluginInfo" JSONB;

-- The status call looks a site up by this hash and nothing else.
CREATE INDEX IF NOT EXISTS "WidgetSite_pluginKeyHash_idx" ON "WidgetSite" ("pluginKeyHash");
