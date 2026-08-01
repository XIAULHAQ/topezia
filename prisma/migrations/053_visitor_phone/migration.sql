-- 053_visitor_phone — the widget's leave-a-message form gains an optional
-- phone number.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-052).
--
-- Additive.

ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "visitorPhone" TEXT;
