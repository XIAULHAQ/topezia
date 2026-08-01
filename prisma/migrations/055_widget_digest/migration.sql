-- 055_widget_digest — the widget remembers what visitors asked, so the
-- owner can be told once a week.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-052).
--
-- Additive. WidgetQuestion is a rolling log of what visitors asked the AI
-- (question text + whether the site's content could answer it) — the raw
-- material of the weekly "what visitors asked" digest, and of the content
-- gaps it points out ("people keep asking X and your site doesn't say").
-- Rows older than ~90 days are purged by the digest cron; this is telemetry
-- about the owner's own site, not an archive.

CREATE TABLE IF NOT EXISTS "WidgetQuestion" (
  "id"        TEXT NOT NULL,
  "siteId"    TEXT NOT NULL,
  "question"  TEXT NOT NULL,
  -- false = the bot handed off ("I don't have that written down") — the
  -- signal the digest turns into content-gap advice.
  "answered"  BOOLEAN NOT NULL DEFAULT true,
  "pageUrl"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WidgetQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WidgetQuestion_siteId_createdAt_idx"
  ON "WidgetQuestion"("siteId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "WidgetQuestion" ADD CONSTRAINT "WidgetQuestion_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "WidgetSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WidgetQuestion" ENABLE ROW LEVEL SECURITY;

-- Weekly digest: on by default (it only sends when there was activity),
-- digestSentAt is the double-send guard and the window anchor.
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "digestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "digestSentAt" TIMESTAMP(3);
