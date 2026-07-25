-- Work eligibility: separate WHERE YOU MAY WORK from WHERE YOU ARE.
--
-- The feed was scoped entirely by Profile.country (parsed from the résumé's
-- location), which conflates three different facts: where you live, where you
-- are legally allowed to work, and where you'd be willing to work. A US citizen
-- living in Pakistan saw only Pakistani jobs; a Pakistani national who would
-- relocate to the US with sponsorship never saw a US job at all.
--
-- Arrays, not a single value, because work rights are genuinely plural: dual
-- nationals, EU citizens (27 countries), Gulf residents. The existing
-- WorkAuthorization enum can't express any of that — it stays for the
-- reranker's prompt, but it is not the filter.
ALTER TABLE "Profile" ADD COLUMN "authorizedCountries" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Profile" ADD COLUMN "relocateCountries" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill so no existing feed changes on deploy: everyone is treated as
-- authorized exactly where they already are, which is what the old
-- country-only filter assumed. An empty array means "never told us", and the
-- matcher falls back to Profile.country for those.
UPDATE "Profile" SET "authorizedCountries" = ARRAY["country"] WHERE "country" IS NOT NULL;
