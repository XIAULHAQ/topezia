-- Endorsements: recommendations and reviews written by SOMEONE ELSE.
--
-- Profile.recommendations (JSON) stays as-is — that is the member's own
-- curated quotes, and deleting it would throw away what people already wrote.
-- The two live side by side on the profile with different labels, because
-- they are different claims: "added by the member" vs "written by the person
-- named, through a request".
CREATE TYPE "EndorsementKind" AS ENUM ('RECOMMENDATION', 'REVIEW');
CREATE TYPE "EndorsementStatus" AS ENUM ('PENDING', 'SUBMITTED');

CREATE TABLE "Endorsement" (
  "id"          TEXT PRIMARY KEY,
  "profileId"   TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "kind"        "EndorsementKind" NOT NULL,
  "status"      "EndorsementStatus" NOT NULL DEFAULT 'PENDING',
  "token"       TEXT NOT NULL UNIQUE,
  "sentToLabel" TEXT,
  "requestNote" TEXT,
  "portfolioId" TEXT REFERENCES "Portfolio"("id") ON DELETE SET NULL,
  "authorName"  TEXT,
  "authorRole"  TEXT,
  "text"        TEXT,
  "rating"      INTEGER,
  "submittedAt" TIMESTAMP(3),
  "visible"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL
);

CREATE INDEX "Endorsement_profileId_status_idx" ON "Endorsement"("profileId", "status");

-- Same posture as every other table: RLS on with no policies = deny-all
-- through PostgREST. Prisma connects as the table owner and bypasses it.
ALTER TABLE "Endorsement" ENABLE ROW LEVEL SECURITY;
