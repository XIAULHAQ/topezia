-- Employer side, step 1: companies, native postings, and the application
-- pipeline (applied → shortlisted → interview → selected).
-- Hand-written, applied with `prisma db execute` — see CAVEATS.md.

-- Native postings enter the SAME Job table and pipeline as crawled jobs —
-- matching, feed, SEO and alerts all work on them with zero extra code.
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'NATIVE';

CREATE TABLE "Company" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  -- One company per account for now; relaxing later is an ALTER, not a rebuild.
  "ownerUserId" TEXT NOT NULL UNIQUE,
  "name"        TEXT NOT NULL,
  "slug"        TEXT NOT NULL UNIQUE,
  "tagline"     TEXT,
  "about"       TEXT,
  "website"     TEXT,
  "location"    TEXT,
  "logoUrl"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Job" ADD COLUMN "companyId" TEXT REFERENCES "Company"("id") ON DELETE SET NULL;
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

CREATE TYPE "ApplicationStage" AS ENUM (
  'APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED', 'WITHDRAWN'
);

CREATE TABLE "Application" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "jobId"            TEXT NOT NULL REFERENCES "Job"("id") ON DELETE CASCADE,
  "profileId"        TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "stage"            "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
  "coverNote"        TEXT,
  -- Projects carry a bid; jobs leave these null.
  "proposedRate"     INTEGER,
  "proposedCurrency" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The DB is the lock: one application per person per posting.
  CONSTRAINT "Application_jobId_profileId_key" UNIQUE ("jobId", "profileId")
);

CREATE INDEX "Application_profileId_idx" ON "Application"("profileId");
CREATE INDEX "Application_jobId_stage_idx" ON "Application"("jobId", "stage");

-- Same posture as every other table: RLS on with no policies = deny-all
-- through PostgREST. Prisma connects as the table owner and bypasses it.
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
