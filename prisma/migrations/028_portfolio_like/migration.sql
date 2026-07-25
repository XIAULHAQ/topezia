-- Public likes on a piece of work. The private-bookmark twin (PortfolioSave)
-- already exists; this is the visible one, counted only on the work's own
-- page. Hand-written, applied with `prisma db execute` — see CAVEATS.md.

CREATE TABLE "PortfolioLike" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "profileId"   TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "portfolioId" TEXT NOT NULL REFERENCES "Portfolio"("id") ON DELETE CASCADE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One like per person per piece. In the DB rather than in application code,
-- so a double-click or a retried request cannot inflate a public number.
CREATE UNIQUE INDEX "PortfolioLike_profileId_portfolioId_key" ON "PortfolioLike"("profileId", "portfolioId");
CREATE INDEX "PortfolioLike_portfolioId_createdAt_idx" ON "PortfolioLike"("portfolioId", "createdAt");

-- Same posture as every other table: RLS on with no policies = deny-all
-- through PostgREST. Prisma connects as the table owner and bypasses it.
ALTER TABLE "PortfolioLike" ENABLE ROW LEVEL SECURITY;
