-- Public profile links: LinkedIn, GitHub, website, contact email.
-- Display-only columns — no index needed, never read by matching.
-- Hand-applied with `prisma db execute` + `migrate resolve --applied`
-- (never `migrate dev/deploy` on the live DB — it would drop the
-- Unsupported vector embedding columns).
ALTER TABLE "Profile"
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "githubUrl" TEXT,
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "contactEmail" TEXT;
