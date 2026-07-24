-- Resume Builder AI quota: one row per "AI resume update" window.
--
-- HAND-WRITTEN. `prisma migrate diff` is not safe against this database — it
-- does not understand the Unsupported("vector(1024)") columns and emits
-- ALTER TABLE "Job" DROP COLUMN "embedding". See 020/021/022 for the same
-- note. Applied with `prisma db execute --url $DIRECT_URL` then
-- `prisma migrate resolve --applied 023_resume_assist_window`.

CREATE TABLE "ResumeAssistWindow" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeAssistWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumeAssistWindow_profileId_startedAt_idx"
  ON "ResumeAssistWindow"("profileId", "startedAt");

ALTER TABLE "ResumeAssistWindow" ADD CONSTRAINT "ResumeAssistWindow_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same posture as every table here: RLS on, no policies. Prisma connects as
-- the table owner (bypasses RLS); the public PostgREST surface gets deny-all.
ALTER TABLE "ResumeAssistWindow" ENABLE ROW LEVEL SECURITY;
