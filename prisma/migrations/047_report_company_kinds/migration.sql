-- 047_report_company_kinds — let visitors report company pages, work and
-- articles, not just profiles and portfolios.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out, so the differ reads them as drift and emits
-- `ALTER TABLE "Profile" DROP COLUMN "embedding"`, destroying every embedding.
-- Same trap as 044, 045 and 046.
--
-- Purely additive: three new values on an existing enum. No row changes, and
-- nothing already stored means anything different afterwards.
--
-- IF NOT EXISTS makes this re-runnable. Note that a value added to an enum
-- cannot be USED in the same transaction that adds it — which is why this file
-- only declares them and nothing here writes a row with one.

ALTER TYPE "ReportKind" ADD VALUE IF NOT EXISTS 'COMPANY';
ALTER TYPE "ReportKind" ADD VALUE IF NOT EXISTS 'COMPANY_WORK';
ALTER TYPE "ReportKind" ADD VALUE IF NOT EXISTS 'COMPANY_ARTICLE';
