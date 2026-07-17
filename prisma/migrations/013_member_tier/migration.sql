-- Membership tier stub (roadmap paywall, spec §7 monetization).
--
-- The career roadmap's depth (full plan, cert breakdown, "alert me when I newly
-- qualify") is free while we're new, then premium. Adding the flag now means
-- the paywall becomes a config check, not a schema migration under launch load.
-- Everything defaults to FREE; nothing reads this yet.
CREATE TYPE "MemberTier" AS ENUM ('FREE', 'PREMIUM');
ALTER TABLE "Profile" ADD COLUMN "tier" "MemberTier" NOT NULL DEFAULT 'FREE';
