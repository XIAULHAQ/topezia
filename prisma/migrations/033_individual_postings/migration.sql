-- Anyone can post — individual or company. The owner link moves off Company:
-- postedByUserId is stamped on every NATIVE posting; companyId stays optional
-- branding. Hand-applied with `prisma db execute` — see CAVEATS.md.
ALTER TABLE "Job" ADD COLUMN "postedByUserId" TEXT;
CREATE INDEX "Job_postedByUserId_idx" ON "Job"("postedByUserId");
