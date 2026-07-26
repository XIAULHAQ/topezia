-- Stripe billing rail (hand-written; applied with prisma db execute +
-- migrate resolve --applied, per the no-migrate-on-live rule).
--
-- stripeCustomerId: one Stripe customer per profile, created on first
--                   checkout. Unique so a webhook can resolve the profile.
-- premiumUntil:     end of the paid period from the subscription webhook —
--                   the honest expiry behind tier=PREMIUM.
ALTER TABLE "Profile" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Profile" ADD COLUMN "premiumUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "Profile_stripeCustomerId_key" ON "Profile"("stripeCustomerId");
