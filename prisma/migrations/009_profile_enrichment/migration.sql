-- Profile enrichment (spec §3.4): the parse gains industries + the candidate's
-- own location; skills gain true proficiency (distinct from extraction
-- confidence); preferences gain a salary target and visa/work authorization.
--
-- Hand-written to match Prisma's generated DDL; applied via resolve --applied.
-- Additive and nullable/defaulted throughout, so existing profiles keep working.

-- CreateEnum
CREATE TYPE "SkillProficiency" AS ENUM ('FAMILIAR', 'PROFICIENT', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "WorkAuthorization" AS ENUM ('US_AUTHORIZED', 'AUTHORIZED_NEEDS_FUTURE_SPONSORSHIP', 'NEEDS_SPONSORSHIP', 'NOT_SPECIFIED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "currentLocation" TEXT;
ALTER TABLE "Profile" ADD COLUMN "industries" TEXT[];
ALTER TABLE "Profile" ADD COLUMN "salaryTarget" INTEGER;
ALTER TABLE "Profile" ADD COLUMN "workAuthorization" "WorkAuthorization" NOT NULL DEFAULT 'NOT_SPECIFIED';

-- AlterTable
ALTER TABLE "ProfileSkill" ADD COLUMN "proficiency" "SkillProficiency";
