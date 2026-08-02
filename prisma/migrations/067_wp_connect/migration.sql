-- 067_wp_connect — the handshake that turns "installed the plugin" into
-- "the chat is live on this website", without anyone copying a key.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-066).
--
-- THE SHAPE IS AN AUTHORIZATION CODE FLOW, and it is that shape for one
-- reason: the site key must never travel through a browser URL. WordPress
-- registers a pending connection server-to-server and is handed a one-time
-- claim token; the person approves in their browser carrying only `state`,
-- which authorizes nothing on its own; WordPress then exchanges the token
-- for the key server-to-server. A stolen `state` gets an attacker a consent
-- screen for someone else's website and no key.
--
-- `claimHash` is a SHA-256 of the claim token, never the token. A leak of
-- this table is then a leak of hashes — the same reason we don't store
-- passwords. `details` is whatever WordPress detected about the site
-- (name, tagline, logo URL, contact details, WooCommerce settings): it is
-- unverified input from a stranger's server, so it is stored as JSON, shown
-- to the human for approval, and sanitised again on use. Never trusted
-- because it arrived over HTTPS.
--
-- Rows are short-lived by design. A connection nobody approves is rubbish
-- within the hour, and `expiresAt` is what the cleanup and the claim both
-- read. Nothing here is a system of record: every lasting effect lands on
-- Company and WidgetSite.
--
-- Additive. Nothing existing reads this table.

CREATE TABLE IF NOT EXISTS "WpConnect" (
  "id"               TEXT PRIMARY KEY,

  -- The public handle. Travels in the browser URL, authorizes nothing.
  "state"            TEXT NOT NULL UNIQUE,
  -- SHA-256 of the one-time claim token held by the WordPress site.
  "claimHash"        TEXT NOT NULL,

  -- Where the plugin says it lives. `host` is the normalised form we match
  -- WidgetSite on; `siteUrl` keeps the admin URL we send the person back to.
  "host"             TEXT NOT NULL,
  "siteUrl"          TEXT NOT NULL,
  -- wp-admin page to return to. Validated against siteUrl's origin on use —
  -- an open redirect out of an approval screen would be a phishing gift.
  "returnUrl"        TEXT,

  -- What WordPress detected. Unverified; approved by a human before use.
  "details"          JSONB,

  -- PENDING → APPROVED → CLAIMED. EXPIRED is written by the sweep, so a
  -- stale row reads as expired rather than as forever-pending.
  "status"           TEXT NOT NULL DEFAULT 'PENDING',

  -- Filled on approval. The site key itself is READ THROUGH siteId at claim
  -- time rather than copied here: one source of truth, and a deleted site
  -- can't be resurrected by a stale connection row.
  "companyId"        TEXT REFERENCES "Company"("id") ON DELETE CASCADE,
  "siteId"           TEXT REFERENCES "WidgetSite"("id") ON DELETE CASCADE,
  "approvedUserId"   TEXT,
  "approvedAt"       TIMESTAMP(3),
  "claimedAt"        TIMESTAMP(3),

  -- Who asked, for rate limiting and abuse triage. Not shown to anyone.
  "ip"               TEXT,

  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The claim looks a row up by state and then compares hashes; the sweep
-- reads expiry. Nothing else queries this table.
CREATE INDEX IF NOT EXISTS "WpConnect_expiresAt_idx" ON "WpConnect" ("expiresAt");
CREATE INDEX IF NOT EXISTS "WpConnect_host_status_idx" ON "WpConnect" ("host", "status");
