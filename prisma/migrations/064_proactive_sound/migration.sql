-- 064_proactive_sound — a soft chime when the chat opens itself.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-063).
--
-- Additive. Sound only ever plays when the browser permits it — that is,
-- after the visitor has genuinely interacted with the page. Dwelling,
-- scrolling and moving toward the tab bar are NOT interactions as far as
-- autoplay policy is concerned, so on a cold first visit the chat opens
-- silently rather than pretending to chime. It is never played when the
-- visitor opened the chat themselves; they know they did it.
--
-- Its own column rather than riding on `proactive`: a company may well want
-- the chat to introduce itself without making noise on someone's laptop,
-- and audio on a stranger's website is exactly the sort of thing that needs
-- an off switch.

ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "proactiveSound" BOOLEAN NOT NULL DEFAULT true;
