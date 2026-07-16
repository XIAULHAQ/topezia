-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "CardLayout" AS ENUM ('KNOWLEDGE_WORK', 'STRUCTURED_HOURLY');

-- CreateEnum
CREATE TYPE "ResolutionSource" AS ENUM ('RULE', 'LLM', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'WORKABLE', 'SMARTRECRUITERS', 'ADZUNA', 'JOOBLE', 'CPC_FEED', 'JOBPOSTING_SCHEMA');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'HOURLY', 'TEMP');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('YEAR', 'HOUR', 'DAY', 'PER_MILE', 'PROJECT');

-- CreateEnum
CREATE TYPE "RemoteType" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE_US', 'REMOTE_GLOBAL');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'EXEC', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('LIVE', 'EXPIRED', 'SUSPECTED_DEAD', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "HiringVolume" AS ENUM ('ONE_TO_FIVE', 'SIX_TO_TWENTY', 'TWENTY_PLUS');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'INDEXED', 'ACTIVATED');

-- CreateEnum
CREATE TYPE "EntryPath" AS ENUM ('RESUME', 'QUESTIONNAIRE');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('RESUME', 'CONFIRMED', 'USER_ADDED');

-- CreateTable
CREATE TABLE "Vertical" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeepTier" BOOLEAN NOT NULL DEFAULT false,
    "cardLayout" "CardLayout" NOT NULL DEFAULT 'KNOWLEDGE_WORK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verticalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAlias" (
    "id" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resolvedBy" "ResolutionSource" NOT NULL DEFAULT 'RULE',

    CONSTRAINT "RoleAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillAlias" (
    "id" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "resolvedBy" "ResolutionSource" NOT NULL DEFAULT 'RULE',

    CONSTRAINT "SkillAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("jobId","skillId")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "type" "JobSource" NOT NULL,
    "companySlug" TEXT,
    "careersPageUrl" TEXT,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "crawlCadenceHrs" INTEGER NOT NULL DEFAULT 24,
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistSignup" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeFileUrl" TEXT,
    "resumeText" TEXT,
    "fullName" TEXT,
    "headlineRoleId" TEXT,
    "seniority" "Seniority",
    "yearsExperience" DOUBLE PRECISION,
    "workHistory" JSONB,
    "education" JSONB,
    "certifications" TEXT[],
    "employmentTypes" "EmploymentType"[],
    "remoteTypes" "RemoteType"[],
    "locations" TEXT[],
    "salaryFloor" INTEGER,
    "salaryPeriod" "SalaryPeriod",
    "verticalsOptIn" TEXT[],
    "entryPath" "EntryPath" NOT NULL DEFAULT 'RESUME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSkill" (
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" "SkillSource" NOT NULL DEFAULT 'RESUME',

    CONSTRAINT "ProfileSkill_pkey" PRIMARY KEY ("profileId","skillId")
);

-- CreateTable
CREATE TABLE "JobClick" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "matchScore" INTEGER,
    "feedPosition" INTEGER,
    "cpcAttributed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSave" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDismissal" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vertical_slug_key" ON "Vertical"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAlias_rawText_key" ON "RoleAlias"("rawText");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAlias_rawText_key" ON "SkillAlias"("rawText");

-- CreateIndex
CREATE INDEX "Job_status_verticalId_idx" ON "Job"("status", "verticalId");

-- CreateIndex
CREATE INDEX "Job_descriptionHash_idx" ON "Job"("descriptionHash");

-- CreateIndex
CREATE INDEX "Job_locationState_idx" ON "Job"("locationState");

-- CreateIndex
CREATE INDEX "Job_roleId_idx" ON "Job"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_type_companySlug_key" ON "Source"("type", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSignup_sourceId_key" ON "WaitlistSignup"("sourceId");

-- CreateIndex
CREATE INDEX "WaitlistSignup_status_idx" ON "WaitlistSignup"("status");

-- CreateIndex
CREATE INDEX "WaitlistSignup_verticalSlug_idx" ON "WaitlistSignup"("verticalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "JobClick_jobId_idx" ON "JobClick"("jobId");

-- CreateIndex
CREATE INDEX "JobClick_profileId_idx" ON "JobClick"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSave_profileId_jobId_key" ON "JobSave"("profileId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobDismissal_profileId_jobId_key" ON "JobDismissal"("profileId", "jobId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "Vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAlias" ADD CONSTRAINT "RoleAlias_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAlias" ADD CONSTRAINT "SkillAlias_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "Vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistSignup" ADD CONSTRAINT "WaitlistSignup_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSkill" ADD CONSTRAINT "ProfileSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSkill" ADD CONSTRAINT "ProfileSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClick" ADD CONSTRAINT "JobClick_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClick" ADD CONSTRAINT "JobClick_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSave" ADD CONSTRAINT "JobSave_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDismissal" ADD CONSTRAINT "JobDismissal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

