-- 058_company_plans — companies can pay us.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-057).
--
-- Additive. Mirrors the member rail (Profile.tier/premiumUntil/
-- stripeCustomerId) one level up, because a subscription belongs to the
-- COMPANY, not to whoever happened to click buy: an owner handover must not
-- cancel the plan.
--
-- plan is TEXT, not an enum, so adding a tier later is a code change rather
-- than a type migration on a live database. Values: FREE | PRO | STUDIO.
-- planUntil is the paid-through date the webhook mirrors; the webhook stays
-- the only writer of both, exactly as it is for members.
--
-- aiMonthKey/aiRepliesUsed are the POOLED monthly allowance for multi-site
-- plans — same conditional-UPDATE trick as WidgetSite, one level up, so ten
-- sites can share one budget without a counter that drifts.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "plan"             TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "planUntil"        TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "aiMonthKey"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "aiRepliesUsed"    INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Company_stripeCustomerId_key"
  ON "Company"("stripeCustomerId");
