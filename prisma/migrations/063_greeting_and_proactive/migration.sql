-- 063_greeting_and_proactive — the chat opens itself, in the company's words.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-062).
--
-- Additive.
--
-- greeting      the owner's own opening line, editable any time. Overrides
--               the page-aware opener computed from the crawl. Null = keep
--               the computed one, which is usually better than a generic
--               hello because it names what they're looking at.
-- proactive     open the chat by itself after a dwell, a deep scroll, or an
--               attempt to leave. Once per visit, never again in that
--               session — a panel that reopens itself is an advert.
-- proactiveDelay seconds of dwell before that happens.
-- askContact    after the first answer, invite a name, email and phone so a
--               visitor who leaves isn't lost. An INVITE, never a gate: the
--               assistant keeps answering whether they fill it or not.

ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "greeting"       TEXT;
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "proactive"      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "proactiveDelay" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "askContact"     BOOLEAN NOT NULL DEFAULT true;
