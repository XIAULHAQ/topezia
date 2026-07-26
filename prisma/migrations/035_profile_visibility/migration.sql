-- Personal-profile controls (hand-written; applied with prisma db execute +
-- migrate resolve --applied, per the no-migrate-on-live rule).
--
-- openToWork:    member-chosen availability badge, shown on the public profile.
-- publicVisible: master switch — false means /p/{slug} 404s entirely, without
--                touching per-section hiddenSections choices underneath.
ALTER TABLE "Profile" ADD COLUMN "openToWork" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT true;
