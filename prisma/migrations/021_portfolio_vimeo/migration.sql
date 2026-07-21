-- Vimeo support for portfolio videos.
--
-- HAND-WRITTEN. `prisma migrate diff` is not safe against this database: it
-- does not understand the Unsupported("vector(1024)") columns and emits
-- ALTER TABLE "Job" DROP COLUMN "embedding" alongside whatever you asked for,
-- which would destroy matching. See 020_portfolio for the same note.
--
-- Applied with `prisma db execute --url $DIRECT_URL` then
-- `prisma migrate resolve --applied 021_portfolio_vimeo`.

CREATE TYPE "VideoProvider" AS ENUM ('YOUTUBE', 'VIMEO');

-- Nullable: images have no provider.
ALTER TABLE "PortfolioMedia" ADD COLUMN "videoProvider" "VideoProvider";

-- Vimeo unlisted videos carry a private hash that the embed will not play
-- without. Always NULL for YouTube.
ALTER TABLE "PortfolioMedia" ADD COLUMN "videoHash" TEXT;

-- Everything that exists today predates Vimeo and is therefore YouTube.
UPDATE "PortfolioMedia" SET "videoProvider" = 'YOUTUBE'
 WHERE "kind" = 'VIDEO' AND "videoId" IS NOT NULL AND "videoProvider" IS NULL;
