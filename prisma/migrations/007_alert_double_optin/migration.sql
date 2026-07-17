-- Double opt-in for email alerts: nothing is sent to an address that hasn't
-- confirmed. Protects sending reputation (typos / spam-trap addresses bounce)
-- and is the honest consent bar for bulk mail.
--
-- Safe as NOT NULL without a default because JobAlert is empty at this point.
-- Hand-written to match Prisma's generated DDL; applied via resolve --applied.

-- AlterTable
ALTER TABLE "JobAlert" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "JobAlert" ADD COLUMN "confirmToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_confirmToken_key" ON "JobAlert"("confirmToken");
