-- Geography, honestly.
--
-- The model could not express "this job is in Poland": location was locationRaw
-- (free text) plus locationState (a US-only concept), and RemoteType offered
-- only REMOTE_US or REMOTE_GLOBAL. So every remote job whose scope wasn't
-- explicitly global fell through to REMOTE_US — 9 of 11 non-US jobs in the live
-- feed were labelled "Remote US" and shown to US seekers as jobs they could
-- legally take. The US assumption was in the schema, not just the filter.
--
-- Job.country      ISO-3166 alpha-2; NULL means genuinely unknown (never assume US)
-- Job.remoteScope  where a remote job is open to: 'GLOBAL' | region | ISO-2 | NULL
-- Profile.country  ISO-2 of the seeker, derived from their résumé location
-- REMOTE_INTL      remote, scoped somewhere that is neither the US nor everywhere

ALTER TYPE "RemoteType" ADD VALUE IF NOT EXISTS 'REMOTE_INTL';

ALTER TABLE "Job" ADD COLUMN "country" TEXT;
ALTER TABLE "Job" ADD COLUMN "remoteScope" TEXT;
ALTER TABLE "Profile" ADD COLUMN "country" TEXT;

CREATE INDEX "Job_status_country_idx" ON "Job"("status", "country");
