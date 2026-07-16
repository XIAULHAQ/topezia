-- Stage-2 rerank cache (spec §5) + Profile.matchVersion.
-- Hand-written to match Prisma's generated DDL exactly (this DB was baselined,
-- not built via `migrate dev`), applied with `migrate resolve --applied`.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "matchVersion" TEXT;

-- CreateTable
CREATE TABLE "MatchScore" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "matchVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "matchedSkills" TEXT[],
    "gapSkills" TEXT[],
    "whyLine" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchScore_profileId_jobId_key" ON "MatchScore"("profileId", "jobId");

-- CreateIndex
CREATE INDEX "MatchScore_profileId_matchVersion_idx" ON "MatchScore"("profileId", "matchVersion");

-- AddForeignKey
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
