-- AI-tailored, per-job resume versions — "tailor my resume for this job".
--
-- Deliberately a NEW table, not a nullable jobId on ResumeDoc: Postgres treats
-- NULL as distinct in a unique index, so (profileId, jobId=NULL) wouldn't
-- actually stay unique without a hand-written partial index Prisma can't
-- express. jobId is NOT NULL here, so the composite unique index below works
-- exactly as intended — same shape as MatchScore (004_match_cache).
--
-- HAND-WRITTEN, applied with `prisma db execute --url $DIRECT_URL` then
-- `prisma migrate resolve --applied 038_tailored_resume` — same posture as
-- every migration here (`prisma migrate diff` is not safe against this DB;
-- see 020/021/022).

CREATE TABLE "TailoredResumeDoc" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TailoredResumeDoc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TailoredResumeDoc_profileId_jobId_key" ON "TailoredResumeDoc"("profileId", "jobId");

ALTER TABLE "TailoredResumeDoc" ADD CONSTRAINT "TailoredResumeDoc_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TailoredResumeDoc" ADD CONSTRAINT "TailoredResumeDoc_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same posture as every table here: RLS on, no policies. Prisma connects as
-- the table owner (bypasses RLS); the public PostgREST surface gets deny-all.
ALTER TABLE "TailoredResumeDoc" ENABLE ROW LEVEL SECURITY;
