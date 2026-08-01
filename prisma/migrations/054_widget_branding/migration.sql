-- 054_widget_branding — the free tier's attribution line.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-053).
--
-- Additive. `branded` defaults TRUE: every widget carries the Topezia line
-- until something explicitly turns it off. Nothing in the product turns it
-- off today — there is no employer billing surface — so this is the switch a
-- paid plan will flip, not a pretend one. Set it by hand for a customer who
-- has actually paid.

ALTER TABLE "WidgetSite"
  ADD COLUMN IF NOT EXISTS "branded" BOOLEAN NOT NULL DEFAULT true;
