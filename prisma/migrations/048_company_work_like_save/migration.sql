-- 048_company_work_like_save — Like and Save on a company's work.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out, so the differ reads them as drift and emits
-- `ALTER TABLE "Profile" DROP COLUMN "embedding"`, destroying every embedding.
-- Same trap as 044-047.
--
-- Exact mirrors of PortfolioSave / PortfolioLike, down to the unique indexes:
-- one save and one like per person per piece, enforced by the DB so a
-- double-click or a retried request can never inflate a count.
--
-- Purely additive: two new tables, nothing existing is touched.

CREATE TABLE IF NOT EXISTS "CompanyWorkSave" (
  "id"        TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "workId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyWorkSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyWorkSave_profileId_workId_key" ON "CompanyWorkSave"("profileId", "workId");
CREATE INDEX IF NOT EXISTS "CompanyWorkSave_profileId_createdAt_idx" ON "CompanyWorkSave"("profileId", "createdAt");

CREATE TABLE IF NOT EXISTS "CompanyWorkLike" (
  "id"        TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "workId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyWorkLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyWorkLike_profileId_workId_key" ON "CompanyWorkLike"("profileId", "workId");
CREATE INDEX IF NOT EXISTS "CompanyWorkLike_workId_createdAt_idx" ON "CompanyWorkLike"("workId", "createdAt");

-- Foreign keys, named as Prisma would name them so a future diff sees no drift.
DO $$ BEGIN
  ALTER TABLE "CompanyWorkSave" ADD CONSTRAINT "CompanyWorkSave_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyWorkSave" ADD CONSTRAINT "CompanyWorkSave_workId_fkey"
    FOREIGN KEY ("workId") REFERENCES "CompanyWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyWorkLike" ADD CONSTRAINT "CompanyWorkLike_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyWorkLike" ADD CONSTRAINT "CompanyWorkLike_workId_fkey"
    FOREIGN KEY ("workId") REFERENCES "CompanyWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
