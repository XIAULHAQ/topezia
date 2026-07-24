-- Resume Builder: one stored resume document per profile.
--
-- HAND-WRITTEN. `prisma migrate diff` is not safe against this database — it
-- does not understand the Unsupported("vector(1024)") columns and emits
-- ALTER TABLE "Job" DROP COLUMN "embedding". See 020/021 for the same note.
-- Applied with `prisma db execute --url $DIRECT_URL` then
-- `prisma migrate resolve --applied 022_resume_doc`.

CREATE TABLE "ResumeDoc" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResumeDoc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResumeDoc_profileId_key" ON "ResumeDoc"("profileId");

ALTER TABLE "ResumeDoc" ADD CONSTRAINT "ResumeDoc_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same posture as every table here: RLS on, no policies. Prisma connects as
-- the table owner (bypasses RLS); the public PostgREST surface gets deny-all.
ALTER TABLE "ResumeDoc" ENABLE ROW LEVEL SECURITY;
