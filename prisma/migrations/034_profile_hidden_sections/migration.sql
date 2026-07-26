-- Per-section public-profile visibility: keys of sections the member chose to
-- HIDE from /p/{slug}. Empty = everything shows (the default, unchanged).
ALTER TABLE "Profile" ADD COLUMN "hiddenSections" TEXT[] NOT NULL DEFAULT '{}';
