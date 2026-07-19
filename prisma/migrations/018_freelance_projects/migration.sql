-- Freelance projects (Freelancer.com click-out aggregation, pre-Phase-3).
-- Projects live in the Job table: same matching, insights and click-out
-- machinery; `kind` lets the feed and UI tell them apart.
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'FREELANCER_COM';

CREATE TYPE "JobKind" AS ENUM ('JOB', 'PROJECT');

ALTER TABLE "Job" ADD COLUMN "kind" "JobKind" NOT NULL DEFAULT 'JOB';
