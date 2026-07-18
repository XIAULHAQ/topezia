-- Public profile slug (SEO). Each profile gets a stable /p/{slug} URL,
-- e.g. /p/raheel-ali-k3m9x2. Nullable + unique so old rows can backfill lazily.
ALTER TABLE "Profile" ADD COLUMN "publicSlug" TEXT;
CREATE UNIQUE INDEX "Profile_publicSlug_key" ON "Profile"("publicSlug");
