-- Company logos: store the storage PATH, not a URL.
--
-- `logoUrl` existed since the Company model was added but was never written by
-- any code path — /api/company's sanitize() never included it. So this is a
-- pure rename with no data to migrate, and no risk of orphaning a value.
--
-- Renamed rather than adding a second column so there is exactly one field and
-- no dead one: a column called logoUrl holding "{uuid}/{uuid}.png" is a trap
-- for whoever reads it next.
ALTER TABLE "Company" RENAME COLUMN "logoUrl" TO "logoPath";
