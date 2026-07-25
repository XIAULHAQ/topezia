-- Publications / Research: papers, books, theses on a profile.
-- Hand-written, applied with `prisma db execute` — see CAVEATS.md.

CREATE TYPE "PublicationType" AS ENUM (
  'JOURNAL_ARTICLE', 'CONFERENCE_PAPER', 'BOOK', 'BOOK_CHAPTER',
  'THESIS', 'REPORT', 'PREPRINT', 'OTHER'
);

CREATE TABLE "Publication" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "type"      "PublicationType" NOT NULL,
  "title"     TEXT NOT NULL,
  "authors"   TEXT[] NOT NULL DEFAULT '{}',
  "venue"     TEXT,
  "year"      INTEGER,
  "doi"       TEXT,
  "isbn"      TEXT,
  "url"       TEXT,
  "abstract"  TEXT,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Publication_profileId_position_idx" ON "Publication"("profileId", "position");

-- Same posture as every other table: RLS on with no policies = deny-all
-- through PostgREST. Prisma connects as the table owner and bypasses it.
ALTER TABLE "Publication" ENABLE ROW LEVEL SECURITY;
