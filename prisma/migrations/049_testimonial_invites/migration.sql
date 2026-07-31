-- 049_testimonial_invites — let a company ask a client to write the
-- testimonial themselves, instead of only typing it in.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out, so the differ reads them as drift and emits
-- `ALTER TABLE "Profile" DROP COLUMN "embedding"`, destroying every embedding.
-- Same trap as 044-048.
--
-- Additive. Existing testimonials default to origin COMPANY, which is exactly
-- what they are: copy the company typed about itself.

DO $$ BEGIN
  CREATE TYPE "TestimonialOrigin" AS ENUM ('COMPANY', 'INVITED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CompanyTestimonial"
  ADD COLUMN IF NOT EXISTS "origin" "TestimonialOrigin" NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "CompanyTestimonial"
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CompanyTestimonialInvite" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "clientLabel"   TEXT,
  "token"         TEXT NOT NULL,
  "status"        "CompanyInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "submittedAt"   TIMESTAMP(3),
  "testimonialId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyTestimonialInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTestimonialInvite_token_key" ON "CompanyTestimonialInvite"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTestimonialInvite_testimonialId_key" ON "CompanyTestimonialInvite"("testimonialId");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTestimonialInvite_companyId_email_key" ON "CompanyTestimonialInvite"("companyId", "email");
CREATE INDEX IF NOT EXISTS "CompanyTestimonialInvite_companyId_status_idx" ON "CompanyTestimonialInvite"("companyId", "status");

DO $$ BEGIN
  ALTER TABLE "CompanyTestimonialInvite" ADD CONSTRAINT "CompanyTestimonialInvite_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL, not CASCADE: if a submitted testimonial is ever removed, the record
-- that an invitation was sent and answered should survive it.
DO $$ BEGIN
  ALTER TABLE "CompanyTestimonialInvite" ADD CONSTRAINT "CompanyTestimonialInvite_testimonialId_fkey"
    FOREIGN KEY ("testimonialId") REFERENCES "CompanyTestimonial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
