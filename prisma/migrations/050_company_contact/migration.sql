-- 050_company_contact — company-configured contact form + inquiry inbox.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out, so the differ reads them as drift and emits
-- `ALTER TABLE "Profile" DROP COLUMN "embedding"`, destroying every embedding.
-- Same trap as 044-049.
--
-- Additive. The design in one sentence: the contact form is the only way a
-- member can start contact with a company, a submission is an inbox item (not
-- a chat), and a thread exists only once the company replies — so companies
-- can be reached without being spammable.

DO $$ BEGIN
  CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'REPLIED', 'ARCHIVED', 'SPAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InquirySender" AS ENUM ('COMPANY', 'CANDIDATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contact-form config lives on Company: a 1:1 table would buy nothing.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "contactEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "contactReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "contactQuestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "CompanyInquiry" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "reason"    TEXT,
  "message"   TEXT NOT NULL,
  "answers"   JSONB,
  "status"    "InquiryStatus" NOT NULL DEFAULT 'NEW',
  "repliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InquiryMessage" (
  "id"        TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "sender"    "InquirySender" NOT NULL,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InquiryMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyInquiry_companyId_status_createdAt_idx"
  ON "CompanyInquiry"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanyInquiry_profileId_createdAt_idx"
  ON "CompanyInquiry"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "InquiryMessage_inquiryId_createdAt_idx"
  ON "InquiryMessage"("inquiryId", "createdAt");

-- The open-inquiry rule: one unanswered submission per member per company.
-- Partial, so history (REPLIED/ARCHIVED/SPAM) never blocks a later contact —
-- the 30-day resubmit cooldown on non-replied outcomes is enforced in code.
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInquiry_open_one_per_sender"
  ON "CompanyInquiry"("companyId", "profileId") WHERE "status" = 'NEW';

DO $$ BEGIN
  ALTER TABLE "CompanyInquiry" ADD CONSTRAINT "CompanyInquiry_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyInquiry" ADD CONSTRAINT "CompanyInquiry_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InquiryMessage" ADD CONSTRAINT "InquiryMessage_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "CompanyInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deny-all RLS, same as migration 032: enabled with zero policies. Prisma
-- connects as postgres and bypasses it; anon/authenticated get nothing.
ALTER TABLE "CompanyInquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InquiryMessage" ENABLE ROW LEVEL SECURITY;
