-- 046_company_work_media — videos on a company's work, alongside images.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out, so the differ reads them as drift and emits
-- `ALTER TABLE "Profile" DROP COLUMN "embedding"`, destroying every embedding.
-- Same trap as 044 and 045.
--
-- CompanyWorkImage becomes CompanyWorkMedia because it now holds videos too.
-- The table is DROPPED and recreated rather than altered — it shipped one day
-- ago and holds zero rows, verified before writing this. The guard below
-- refuses the drop if that is ever untrue, so re-running this against a
-- database where someone did add rows fails loudly instead of destroying them.

DO $$
DECLARE row_count bigint;
BEGIN
  IF to_regclass('public."CompanyWorkImage"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "CompanyWorkImage"' INTO row_count;
    IF row_count > 0 THEN
      RAISE EXCEPTION
        'CompanyWorkImage holds % row(s). Refusing to drop it — rename the table and add the columns instead.',
        row_count;
    END IF;
    DROP TABLE "CompanyWorkImage";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CompanyWorkMedia" (
  "id"            TEXT NOT NULL,
  "workId"        TEXT NOT NULL,
  "kind"          "PortfolioMediaKind" NOT NULL DEFAULT 'IMAGE',
  "path"          TEXT NOT NULL,
  "videoId"       TEXT,
  "videoProvider" "VideoProvider",
  "videoHash"     TEXT,
  "width"         INTEGER,
  "height"        INTEGER,
  "caption"       TEXT,
  "position"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyWorkMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyWorkMedia_workId_position_idx" ON "CompanyWorkMedia"("workId", "position");

DO $$ BEGIN
  ALTER TABLE "CompanyWorkMedia" ADD CONSTRAINT "CompanyWorkMedia_workId_fkey"
    FOREIGN KEY ("workId") REFERENCES "CompanyWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
