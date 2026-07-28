-- First-party blog ("Topezia Team" byline — /hq has no per-user accounts,
-- just a single shared password gate, so there's no author identity to hang
-- a post on). Tags are a free-text TEXT[] column, not a taxonomy join table,
-- same call as Portfolio.skills/technologies (020_portfolio).
--
-- HAND-WRITTEN, applied with `prisma db execute --url $DIRECT_URL` then
-- `prisma migrate resolve --applied 039_blog_posts` — same posture as every
-- migration here (`prisma migrate diff` is not safe against this DB; see
-- 020/021/022).

CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "contentHtml" TEXT NOT NULL,
    "coverImage" TEXT,
    "coverImageAlt" TEXT,
    "focusKeyword" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "tags" TEXT[],
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");

-- Not expressible in schema.prisma (Prisma's DSL has no clean way to declare
-- a non-btree index type across the versions this repo has moved through),
-- so it's SQL-only here — same situation as this DB's vector indexes.
CREATE INDEX "Post_tags_idx" ON "Post" USING GIN ("tags");

-- Same posture as every table here: RLS on, no policies. Prisma connects as
-- the table owner (bypasses RLS); the public PostgREST surface gets deny-all.
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
