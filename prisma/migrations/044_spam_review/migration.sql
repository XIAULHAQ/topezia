-- 044 — spam review: an /hq override for false positives, and content reports.
--
-- HAND-WRITTEN, deliberately. `prisma migrate diff` against the live database
-- produces a script that also contains:
--
--     ALTER TABLE "Profile" DROP COLUMN "embedding"
--
-- because the pgvector column is commented out in schema.prisma (Prisma cannot
-- type `vector`), so the differ sees it as drift and offers to delete it. That
-- would destroy every profile embedding — the matcher's core data — along with
-- dropping array defaults and re-adding foreign keys that already exist.
-- See docs/runbooks/prisma-baseline.md: generated SQL is a suggestion to read,
-- never a script to run against production.
--
-- Everything below is ADDITIVE and idempotent: no column is dropped, no type
-- changed, no existing row rewritten. Postgres 11+ stores the new column's
-- default in the catalogue rather than rewriting the table.

-- An /hq override so a wrongly-flagged profile can be indexed anyway. The spam
-- scorer has known false positives (iGaming, pharma — see lib/ugc.ts) and
-- without this the only remedy would be weakening it for everyone.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "spamCleared" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "ReportKind" AS ENUM ('PROFILE', 'PORTFOLIO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'IMPERSONATION', 'OFFENSIVE', 'NOT_THEIR_WORK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- targetId is deliberately NOT a foreign key: a report should survive the thing
-- it is about being deleted, which is the common case once one is acted on.
CREATE TABLE IF NOT EXISTS "ContentReport" (
    "id"             TEXT NOT NULL,
    "kind"           "ReportKind" NOT NULL,
    "targetId"       TEXT NOT NULL,
    "reason"         "ReportReason" NOT NULL,
    "note"           TEXT,
    "reporterUserId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"     TIMESTAMP(3),
    "resolution"     TEXT,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentReport_resolvedAt_createdAt_idx"
    ON "ContentReport"("resolvedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "ContentReport_kind_targetId_idx"
    ON "ContentReport"("kind", "targetId");

-- One report per person per page. NULLs are DISTINCT in Postgres, so this does
-- NOT collapse anonymous reports into one — those are bounded by the route's
-- rate limit instead, which is the intended behaviour, not an oversight.
CREATE UNIQUE INDEX IF NOT EXISTS "ContentReport_kind_targetId_reporterUserId_key"
    ON "ContentReport"("kind", "targetId", "reporterUserId");
