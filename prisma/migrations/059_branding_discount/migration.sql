-- 059_branding_discount — pay less, keep our badge.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-058).
--
-- Additive. A paying company can opt to keep an "AI chat powered by
-- Topezia" line on their widget in exchange for a standing discount. The
-- MONEY side is a Stripe coupon on the subscription; this column is the
-- DISPLAY side, and the two are set together.
--
-- It exists as its own column rather than being inferred from the plan
-- because it is orthogonal to it: any paid plan can carry the badge, and
-- the discount must survive a plan change. The widget reads it directly, so
-- a company getting the discount ALWAYS shows the badge — the arrangement
-- is only honest if we actually display what they're being paid to display.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandingDiscount" BOOLEAN NOT NULL DEFAULT false;
