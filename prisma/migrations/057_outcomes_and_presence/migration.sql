-- 057_outcomes_and_presence — did the chat actually make money, what does
-- the widget look like, and when is anyone there to answer.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-056).
--
-- Additive.
--
-- outcome/dealValue — revenue attribution, and the ONLY honest version of
-- it available to us: the owner marks a conversation WON or LOST and types
-- what it was worth. We have no payment rail and no CRM, so every number
-- shown anywhere is a number the owner entered by hand. Nothing is
-- estimated, inferred from message text, or extrapolated — an invented
-- "attributed revenue" figure would be worse than showing none.
-- NULL outcome = still open, which is most of them.
--
-- accentColor — the widget in the customer's brand colour, not ours.
-- replyHours — {"tz","days":[1..7],"start":"09:00","end":"17:00"}; when set,
-- the widget says plainly that nobody is there right now instead of
-- implying someone is.

ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "outcome"   TEXT;
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "dealValue" INTEGER;
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "outcomeAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CompanyInquiry_companyId_outcome_idx"
  ON "CompanyInquiry"("companyId", "outcome");

ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "accentColor" TEXT;
ALTER TABLE "WidgetSite" ADD COLUMN IF NOT EXISTS "replyHours"  JSONB;
