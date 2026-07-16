-- Source.companyName display override (spec §4 — ATS list APIs frequently omit
-- a real company name; Greenhouse exposes it via board metadata, Ashby/Lever
-- don't). Hand-written to match Prisma DDL; applied via resolve --applied.

-- AlterTable
ALTER TABLE "Source" ADD COLUMN "companyName" TEXT;
