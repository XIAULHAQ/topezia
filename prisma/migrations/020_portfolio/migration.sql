-- Portfolio: a member's own published work.
--
-- Distinct from Job.kind = PROJECT, which is a freelance brief someone is
-- hiring for. These are work already done, shown off. Public by product
-- decision — a portfolio exists to be seen and indexed.
--
-- HAND-WRITTEN, and deliberately so. `prisma migrate diff` additionally emitted
--   ALTER TABLE "Job" DROP COLUMN "embedding";
--   ALTER TABLE "Profile" DROP COLUMN "embedding";
--   DROP INDEX "job_embedding_idx"; DROP INDEX "job_title_trgm_idx";
-- because the pgvector columns are Unsupported() and sit commented out in
-- schema.prisma, so Prisma believes they should not exist. Applying that would
-- have destroyed every embedding and both retrieval indexes — the whole
-- matching system. Only the portfolio statements below were taken.

CREATE TYPE "PortfolioCategory" AS ENUM (
  -- Marketing & Creative
  'BRANDING_IDENTITY', 'GRAPHIC_DESIGN', 'ILLUSTRATION', 'PHOTOGRAPHY',
  'VIDEO_MOTION', 'UI_UX_DESIGN', 'SOCIAL_CONTENT', 'COPYWRITING',
  -- Tech & Software
  'WEB_APPLICATION', 'MOBILE_APP', 'API_BACKEND', 'OPEN_SOURCE',
  'DATA_ML', 'DEVOPS_INFRA', 'TECHNICAL_WRITING'
);

CREATE TYPE "PortfolioStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TYPE "PortfolioMediaKind" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "PortfolioCategory" NOT NULL,
    "status" "PortfolioStatus" NOT NULL DEFAULT 'DRAFT',
    "coverPath" TEXT,
    "coverWidth" INTEGER,
    "coverHeight" INTEGER,
    "skills" TEXT[],
    "technologies" TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioMedia" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "kind" "PortfolioMediaKind" NOT NULL,
    "path" TEXT NOT NULL,
    "videoId" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioSave" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Portfolio_slug_key" ON "Portfolio"("slug");
CREATE INDEX "Portfolio_profileId_status_idx" ON "Portfolio"("profileId", "status");
CREATE INDEX "Portfolio_status_publishedAt_idx" ON "Portfolio"("status", "publishedAt");
CREATE INDEX "Portfolio_category_status_publishedAt_idx" ON "Portfolio"("category", "status", "publishedAt");
CREATE INDEX "PortfolioMedia_portfolioId_position_idx" ON "PortfolioMedia"("portfolioId", "position");
CREATE INDEX "PortfolioSave_profileId_createdAt_idx" ON "PortfolioSave"("profileId", "createdAt");
CREATE UNIQUE INDEX "PortfolioSave_profileId_portfolioId_key" ON "PortfolioSave"("profileId", "portfolioId");

ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioMedia" ADD CONSTRAINT "PortfolioMedia_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioSave" ADD CONSTRAINT "PortfolioSave_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioSave" ADD CONSTRAINT "PortfolioSave_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
