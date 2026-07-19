-- Insight alerts: opt-in flag + one-click unsubscribe token on Profile, and
-- the InsightSnapshot table (weekly compact capture of a profile's insights,
-- diffed to detect "your market moved"). All additive.
ALTER TABLE "Profile" ADD COLUMN "insightAlerts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN "insightUnsubToken" TEXT;
UPDATE "Profile" SET "insightUnsubToken" = gen_random_uuid()::text WHERE "insightUnsubToken" IS NULL;
ALTER TABLE "Profile" ALTER COLUMN "insightUnsubToken" SET NOT NULL;
CREATE UNIQUE INDEX "Profile_insightUnsubToken_key" ON "Profile"("insightUnsubToken");

CREATE TABLE "InsightSnapshot" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    CONSTRAINT "InsightSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InsightSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InsightSnapshot_profileId_capturedAt_idx" ON "InsightSnapshot"("profileId", "capturedAt");
