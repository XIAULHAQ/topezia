-- 081_widget_answer_cache — reuse recent widget answers (strategy §3.2).
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-080).
--
-- WHY. Small-business chat traffic repeats: "opening hours", "do you ship to
-- X", "how much is Y". Each repeat was a fresh ~6k-token model call. A first-
-- turn question is already embedded for retrieval; this table keeps the answer
-- next to that embedding for 24h so the next visitor asking the same thing
-- (cosine distance < 0.08) gets it with no model call. Brand-scoped like
-- retrieval; emptied on recrawl and on any taught-fact write, so a stale
-- answer can outlive its source by at most the TTL. Cascades with the site.
-- No vector index: with a 24h TTL the table stays small per site and the
-- (siteId, expiresAt) filter does the work.

CREATE TABLE IF NOT EXISTS "WidgetAnswerCache" (
  "id"            TEXT NOT NULL,
  "siteId"        TEXT NOT NULL,
  "pageUrl"       TEXT,
  "pageSensitive" BOOLEAN NOT NULL DEFAULT false,
  "question"      TEXT NOT NULL,
  "embedding"     vector(1024),
  "reply"         TEXT NOT NULL,
  "sources"       JSONB NOT NULL,
  "products"      JSONB NOT NULL,
  "handoff"       BOOLEAN NOT NULL DEFAULT false,
  "hits"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WidgetAnswerCache_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WidgetAnswerCache_siteId_expiresAt_idx" ON "WidgetAnswerCache"("siteId", "expiresAt");
DO $$ BEGIN
  ALTER TABLE "WidgetAnswerCache" ADD CONSTRAINT "WidgetAnswerCache_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "WidgetSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WidgetAnswerCache" ENABLE ROW LEVEL SECURITY;
