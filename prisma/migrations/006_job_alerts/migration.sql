-- Email alerts (spec §7 capture / §9 delivery): a saved search per email address.
-- Hand-written to match Prisma's generated DDL; applied via resolve --applied.

-- CreateEnum
CREATE TYPE "AlertFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "JobAlert" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "queryKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roleId" TEXT,
    "verticalId" TEXT,
    "locationState" TEXT,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "AlertFrequency" NOT NULL DEFAULT 'DAILY',
    "lastSentAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "unsubToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_unsubToken_key" ON "JobAlert"("unsubToken");

-- CreateIndex
CREATE INDEX "JobAlert_email_idx" ON "JobAlert"("email");

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_email_queryKey_key" ON "JobAlert"("email", "queryKey");
