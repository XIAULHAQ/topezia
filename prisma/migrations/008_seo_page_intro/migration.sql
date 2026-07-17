-- Cached LLM page intros (spec §7). Hand-written to match Prisma's generated
-- DDL; applied via resolve --applied on this baselined DB.

-- CreateTable
CREATE TABLE "SeoPageIntro" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "jobCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoPageIntro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoPageIntro_pageKey_key" ON "SeoPageIntro"("pageKey");

-- CreateIndex
CREATE INDEX "SeoPageIntro_generatedAt_idx" ON "SeoPageIntro"("generatedAt");
