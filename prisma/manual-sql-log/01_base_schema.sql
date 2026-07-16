-- Topezia — Phase 1 initial schema
-- Hand-written from prisma/schema.prisma (Prisma CLI's binaries aren't
-- reachable from the sandbox that authored this, so this is a manual
-- translation rather than a `prisma migrate` output). Run this FIRST, then
-- 000_init_vector_support/migration.sql, then 001_pg_trgm/migration.sql.
--
-- IMPORTANT: once you have a real dev environment, run `npx prisma db pull`
-- against this database and diff it against schema.prisma to catch any
-- drift between this hand-written SQL and the Prisma model definitions.

-- ── Enums ──────────────────────────────────────────────

CREATE TYPE "CardLayout" AS ENUM ('KNOWLEDGE_WORK', 'STRUCTURED_HOURLY');
CREATE TYPE "ResolutionSource" AS ENUM ('RULE', 'LLM', 'MANUAL');
CREATE TYPE "JobSource" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'WORKABLE', 'SMARTRECRUITERS', 'ADZUNA', 'JOOBLE', 'CPC_FEED', 'JOBPOSTING_SCHEMA');
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'HOURLY', 'TEMP');
CREATE TYPE "SalaryPeriod" AS ENUM ('YEAR', 'HOUR', 'DAY', 'PER_MILE', 'PROJECT');
CREATE TYPE "RemoteType" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE_US', 'REMOTE_GLOBAL');
CREATE TYPE "Seniority" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'EXEC', 'NOT_APPLICABLE');
CREATE TYPE "JobStatus" AS ENUM ('LIVE', 'EXPIRED', 'SUSPECTED_DEAD', 'DUPLICATE');
CREATE TYPE "HiringVolume" AS ENUM ('ONE_TO_FIVE', 'SIX_TO_TWENTY', 'TWENTY_PLUS');
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'INDEXED', 'ACTIVATED');
CREATE TYPE "EntryPath" AS ENUM ('RESUME', 'QUESTIONNAIRE');
CREATE TYPE "SkillSource" AS ENUM ('RESUME', 'CONFIRMED', 'USER_ADDED');

-- ── Taxonomy (§3.3) ────────────────────────────────────

CREATE TABLE "Vertical" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDeepTier" BOOLEAN NOT NULL DEFAULT false,
  "cardLayout" "CardLayout" NOT NULL DEFAULT 'KNOWLEDGE_WORK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vertical_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vertical_slug_key" ON "Vertical"("slug");

CREATE TABLE "Role" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "verticalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Role_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "Vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");

CREATE TABLE "RoleAlias" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rawText" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "resolvedBy" "ResolutionSource" NOT NULL DEFAULT 'RULE',
  CONSTRAINT "RoleAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoleAlias_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RoleAlias_rawText_key" ON "RoleAlias"("rawText");

CREATE TABLE "Skill" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

CREATE TABLE "SkillAlias" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rawText" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "resolvedBy" "ResolutionSource" NOT NULL DEFAULT 'RULE',
  CONSTRAINT "SkillAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SkillAlias_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SkillAlias_rawText_key" ON "SkillAlias"("rawText");

-- ── Ingestion source registry (§4.1, §8) ───────────────
-- Created before Job/WaitlistSignup since both reference it.

CREATE TABLE "Source" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "type" "JobSource" NOT NULL,
  "companySlug" TEXT,
  "careersPageUrl" TEXT,
  "isPriority" BOOLEAN NOT NULL DEFAULT false,
  "crawlCadenceHrs" INTEGER NOT NULL DEFAULT 24,
  "lastCrawledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Source_type_companySlug_key" ON "Source"("type", "companySlug");

-- ── Canonical job schema (§3.1) ────────────────────────

CREATE TABLE "Job" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "source" "JobSource" NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceCompanySlug" TEXT,
  "externalId" TEXT,
  "titleRaw" TEXT NOT NULL,
  "titleNormalized" TEXT,
  "roleId" TEXT,
  "verticalId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "companyDomain" TEXT,
  "descriptionRaw" TEXT NOT NULL,
  "descriptionHash" TEXT NOT NULL,
  "seniority" "Seniority" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "employmentType" "EmploymentType" NOT NULL,
  "salaryMin" INTEGER,
  "salaryMax" INTEGER,
  "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
  "salaryPeriod" "SalaryPeriod",
  "locationRaw" TEXT,
  "locationLat" DOUBLE PRECISION,
  "locationLng" DOUBLE PRECISION,
  "locationState" TEXT,
  "remoteType" "RemoteType" NOT NULL,
  "verticalFields" JSONB,
  "postedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "JobStatus" NOT NULL DEFAULT 'LIVE',
  "duplicateOfId" TEXT,
  "cpcFeedId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Job_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Job_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "Vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Job_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Job_status_verticalId_idx" ON "Job"("status", "verticalId");
CREATE INDEX "Job_descriptionHash_idx" ON "Job"("descriptionHash");
CREATE INDEX "Job_locationState_idx" ON "Job"("locationState");
CREATE INDEX "Job_roleId_idx" ON "Job"("roleId");

CREATE TABLE "JobSkill" (
  "jobId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("jobId", "skillId"),
  CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── Founding-employer waitlist (§8) ────────────────────

CREATE TABLE "WaitlistSignup" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "careersPageUrl" TEXT NOT NULL,
  "hiringVolume" "HiringVolume",
  "verticalSlug" TEXT,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
  "isFoundingMember" BOOLEAN NOT NULL DEFAULT false,
  "foundingRank" INTEGER,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WaitlistSignup_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WaitlistSignup_sourceId_key" ON "WaitlistSignup"("sourceId");
CREATE INDEX "WaitlistSignup_status_idx" ON "WaitlistSignup"("status");
CREATE INDEX "WaitlistSignup_verticalSlug_idx" ON "WaitlistSignup"("verticalSlug");

-- ── User profile schema (§3.4) ─────────────────────────

CREATE TABLE "Profile" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "resumeFileUrl" TEXT,
  "resumeText" TEXT,
  "fullName" TEXT,
  "headlineRoleId" TEXT,
  "seniority" "Seniority",
  "yearsExperience" DOUBLE PRECISION,
  "workHistory" JSONB,
  "education" JSONB,
  "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "employmentTypes" "EmploymentType"[] NOT NULL DEFAULT ARRAY[]::"EmploymentType"[],
  "remoteTypes" "RemoteType"[] NOT NULL DEFAULT ARRAY[]::"RemoteType"[],
  "locations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "salaryFloor" INTEGER,
  "salaryPeriod" "SalaryPeriod",
  "verticalsOptIn" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "entryPath" "EntryPath" NOT NULL DEFAULT 'RESUME',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

CREATE TABLE "ProfileSkill" (
  "profileId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "source" "SkillSource" NOT NULL DEFAULT 'RESUME',
  CONSTRAINT "ProfileSkill_pkey" PRIMARY KEY ("profileId", "skillId"),
  CONSTRAINT "ProfileSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProfileSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── Signals (§3.4, §5, §6.3) ────────────────────────────

CREATE TABLE "JobClick" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "profileId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "matchScore" INTEGER,
  "feedPosition" INTEGER,
  "cpcAttributed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobClick_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobClick_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JobClick_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "JobClick_jobId_idx" ON "JobClick"("jobId");
CREATE INDEX "JobClick_profileId_idx" ON "JobClick"("profileId");

CREATE TABLE "JobSave" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "profileId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobSave_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobSave_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JobSave_profileId_jobId_key" ON "JobSave"("profileId", "jobId");

CREATE TABLE "JobDismissal" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "profileId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobDismissal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobDismissal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JobDismissal_profileId_jobId_key" ON "JobDismissal"("profileId", "jobId");
