-- 051_widget_chat — the embeddable site chat widget: crawled site content,
-- and inquiries that can come from an anonymous website visitor.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff`: schema.prisma keeps the pgvector columns commented
-- out, so the differ reads them as drift and emits
-- `ALTER TABLE "Profile" DROP COLUMN "embedding"`, destroying every embedding.
-- Same trap as 044-050.
--
-- Additive except ONE loosening: CompanyInquiry.profileId becomes NULLABLE.
-- Widget visitors have no Topezia account by design; their identity is the
-- email they leave, verified the same way testimonial invites are — the reply
-- lands in that mailbox. Every existing row keeps its profileId; every FORM
-- inquiry still requires one in code.

DO $$ BEGIN
  CREATE TYPE "InquirySource" AS ENUM ('FORM', 'WIDGET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One widget per company (free-tier shape; the unique is the cap).
CREATE TABLE IF NOT EXISTS "WidgetSite" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "domain"       TEXT NOT NULL,
  "siteToken"    TEXT NOT NULL,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
  "crawledAt"    TIMESTAMP(3),
  "crawlError"   TEXT,
  -- Monthly AI budget, tracked as (which month, how many used). Rolls over by
  -- comparison at read time — no cron needed to reset a counter.
  "monthKey"     TEXT NOT NULL DEFAULT '',
  "messagesUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WidgetSite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WidgetSite_companyId_key" ON "WidgetSite"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "WidgetSite_siteToken_key" ON "WidgetSite"("siteToken");
DO $$ BEGIN
  ALTER TABLE "WidgetSite" ADD CONSTRAINT "WidgetSite_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A chunk of the customer's own site, embedded for retrieval. Wiped and
-- rewritten on every crawl — this is a cache of their site, not a record.
CREATE TABLE IF NOT EXISTS "SiteChunk" (
  "id"        TEXT NOT NULL,
  "siteId"    TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "title"     TEXT NOT NULL DEFAULT '',
  "content"   TEXT NOT NULL,
  "embedding" vector(1024),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteChunk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SiteChunk_siteId_idx" ON "SiteChunk"("siteId");
DO $$ BEGIN
  ALTER TABLE "SiteChunk" ADD CONSTRAINT "SiteChunk_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "WidgetSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inquiries learn where they came from and who an anonymous sender is.
ALTER TABLE "CompanyInquiry" ALTER COLUMN "profileId" DROP NOT NULL;
ALTER TABLE "CompanyInquiry"
  ADD COLUMN IF NOT EXISTS "source" "InquirySource" NOT NULL DEFAULT 'FORM';
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "visitorEmail" TEXT;
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "visitorName" TEXT;
-- The anonymous sender's key to their own thread (/i/{token}). Random 24
-- bytes; possession = "the reply email reached this mailbox".
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "threadToken" TEXT;
-- The chat that led up to the message: [{ role: 'visitor'|'bot', text }].
ALTER TABLE "CompanyInquiry" ADD COLUMN IF NOT EXISTS "transcript" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInquiry_threadToken_key"
  ON "CompanyInquiry"("threadToken");
-- Same open-inquiry rule as members, keyed on the email a visitor typed.
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInquiry_open_one_per_visitor"
  ON "CompanyInquiry"("companyId", "visitorEmail")
  WHERE "status" = 'NEW' AND "source" = 'WIDGET';

-- Deny-all RLS, same as every table here: enabled, zero policies.
ALTER TABLE "WidgetSite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteChunk" ENABLE ROW LEVEL SECURITY;
