-- Employer dashboard: draft postings + real posting-view counting.
--
-- DRAFT is added BEFORE 'LIVE' in the enum only for readability; Postgres
-- enum order has no behavioural meaning for us (nothing sorts on it).
-- Every existing read path already filters `status = 'LIVE'`, so adding a
-- new value cannot leak drafts into the feed, the matcher or the sitemap.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'LIVE';

-- One row per (posting, viewer, day). The unique constraint IS the dedupe:
-- the write path upserts on conflict, so a refresh loop can't inflate an
-- employer's view count.
CREATE TABLE IF NOT EXISTS "JobView" (
  "id"        TEXT NOT NULL,
  "jobId"     TEXT NOT NULL,
  "viewerKey" TEXT NOT NULL,
  "profileId" TEXT,
  "day"       DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobView_jobId_viewerKey_day_key"
  ON "JobView"("jobId", "viewerKey", "day");
CREATE INDEX IF NOT EXISTS "JobView_jobId_day_idx"
  ON "JobView"("jobId", "day");

ALTER TABLE "JobView"
  ADD CONSTRAINT "JobView_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
