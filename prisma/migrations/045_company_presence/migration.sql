-- 045_company_presence — the company's own presence, beside its postings.
--
-- HAND-WRITTEN, then applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate this with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out (Prisma can't type `vector`), so the differ reads them as drift and
-- emits `ALTER TABLE "Profile" DROP COLUMN "embedding"` — which would destroy
-- every embedding in the database. Same trap as migration 044.
--
-- Everything is IF NOT EXISTS / idempotent so a partial apply can be re-run.

-- ── /hq spam override for companies, mirroring Profile.spamCleared ──────────
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "spamCleared" BOOLEAN NOT NULL DEFAULT false;

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CompanyRole" AS ENUM ('OWNER', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CompanyInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Work / portfolio ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompanyWork" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "summary"     TEXT,
  "description" TEXT,
  "clientName"  TEXT,
  "projectUrl"  TEXT,
  "tags"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "coverPath"   TEXT,
  "coverWidth"  INTEGER,
  "coverHeight" INTEGER,
  "status"      "PortfolioStatus" NOT NULL DEFAULT 'DRAFT',
  "position"    INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyWork_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyWork_companyId_slug_key" ON "CompanyWork"("companyId", "slug");
CREATE INDEX IF NOT EXISTS "CompanyWork_companyId_status_position_idx" ON "CompanyWork"("companyId", "status", "position");

CREATE TABLE IF NOT EXISTS "CompanyWorkImage" (
  "id"        TEXT NOT NULL,
  "workId"    TEXT NOT NULL,
  "path"      TEXT NOT NULL,
  "width"     INTEGER,
  "height"    INTEGER,
  "caption"   TEXT,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyWorkImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyWorkImage_workId_position_idx" ON "CompanyWorkImage"("workId", "position");

-- ── Testimonials ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompanyTestimonial" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "quote"         TEXT NOT NULL,
  "authorName"    TEXT NOT NULL,
  "authorRole"    TEXT,
  "authorCompany" TEXT,
  "authorUrl"     TEXT,
  "rating"        INTEGER,
  "position"      INTEGER NOT NULL DEFAULT 0,
  "visible"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyTestimonial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyTestimonial_companyId_position_idx" ON "CompanyTestimonial"("companyId", "position");

-- ── Client logos ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompanyClient" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "websiteUrl" TEXT,
  "logoPath"   TEXT,
  "position"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyClient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyClient_companyId_position_idx" ON "CompanyClient"("companyId", "position");

-- ── Articles ────────────────────────────────────────────────────────────────
-- Deliberately NOT rows in "Post": /blog, the tag pages, the sitemap and
-- /hq/posts all read Post with no author filter, and sanitizeBlogHtml leaves
-- external links dofollow because first-party editorial chose them. Company
-- writing is UGC and must be nofollowed — a separate table makes that true by
-- construction instead of by remembering a filter.
CREATE TABLE IF NOT EXISTS "CompanyArticle" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "excerpt"         TEXT,
  "contentHtml"     TEXT NOT NULL,
  "coverPath"       TEXT,
  "coverAlt"        TEXT,
  "focusKeyword"    TEXT,
  "metaTitle"       TEXT,
  "metaDescription" TEXT,
  "tags"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"          "PostStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyArticle_companyId_slug_key" ON "CompanyArticle"("companyId", "slug");
CREATE INDEX IF NOT EXISTS "CompanyArticle_companyId_status_publishedAt_idx" ON "CompanyArticle"("companyId", "status", "publishedAt");

-- ── Team + invites ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompanyTeamMember" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "profileId"    TEXT,
  "name"         TEXT NOT NULL,
  "title"        TEXT,
  "role"         "CompanyRole" NOT NULL DEFAULT 'MEMBER',
  "visible"      BOOLEAN NOT NULL DEFAULT true,
  "invitedEmail" TEXT,
  "joinedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTeamMember_companyId_userId_key" ON "CompanyTeamMember"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "CompanyTeamMember_companyId_role_idx" ON "CompanyTeamMember"("companyId", "role");

CREATE TABLE IF NOT EXISTS "CompanyInvite" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "token"           TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "status"          "CompanyInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "acceptedAt"      TIMESTAMP(3),
  "acceptedUserId"  TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvite_token_key" ON "CompanyInvite"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvite_companyId_email_key" ON "CompanyInvite"("companyId", "email");
CREATE INDEX IF NOT EXISTS "CompanyInvite_companyId_status_idx" ON "CompanyInvite"("companyId", "status");

-- ── Foreign keys ────────────────────────────────────────────────────────────
-- Named exactly as Prisma would name them, so a future `migrate diff` sees no
-- drift. Everything cascades from Company: deleting a company should take its
-- whole presence with it. CompanyTeamMember.profileId is SET NULL — deleting a
-- profile must not silently remove someone from a company they work at.
DO $$ BEGIN
  ALTER TABLE "CompanyWork" ADD CONSTRAINT "CompanyWork_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyWorkImage" ADD CONSTRAINT "CompanyWorkImage_workId_fkey"
    FOREIGN KEY ("workId") REFERENCES "CompanyWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyTestimonial" ADD CONSTRAINT "CompanyTestimonial_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyClient" ADD CONSTRAINT "CompanyClient_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyArticle" ADD CONSTRAINT "CompanyArticle_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyTeamMember" ADD CONSTRAINT "CompanyTeamMember_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyTeamMember" ADD CONSTRAINT "CompanyTeamMember_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
