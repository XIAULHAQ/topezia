-- Profile.languages + Profile.recommendations (both member-entered JSON).
--
-- HAND-WRITTEN. `prisma migrate diff` is not safe against this database — it
-- does not understand the Unsupported("vector(1024)") columns and emits
-- ALTER TABLE "Job" DROP COLUMN "embedding". See 020-023 for the same note.
-- Applied with `prisma db execute --url $DIRECT_URL` then
-- `prisma migrate resolve --applied 024_languages_recommendations`.

ALTER TABLE "Profile" ADD COLUMN "languages" JSONB;
ALTER TABLE "Profile" ADD COLUMN "recommendations" JSONB;
