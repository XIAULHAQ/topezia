-- Supabase Storage bucket for portfolio images. Idempotent — safe to re-run.
--
-- Run with:
--   npx prisma db execute --url "$DIRECT_URL" --file scripts/setup-portfolio-storage.sql
--
-- This is infrastructure config, not app schema, so it lives here rather than in
-- prisma/migrations — but it is checked in so the bucket can be recreated
-- exactly rather than clicked together in a dashboard.
--
-- Why object storage at all: profile photos are base64 data URIs in a text
-- column, which is fine for one 100px thumbnail and impossible for galleries.
-- A 2MB image is ~2.7MB of base64, several per portfolio, on every row read.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio',
  'portfolio',
  -- Public: portfolios are meant to be seen and indexed, and a public bucket is
  -- served straight from the CDN with no signing round-trip per image.
  true,
  -- 10MB. Generous for a portfolio still, mean enough to stop someone parking
  -- a video file in the image bucket.
  10485760,
  -- Allow-list, not deny-list. No SVG: it is an executable document (script
  -- tags, foreignObject) and serving it from our own origin would be stored
  -- XSS. Raster only.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Read: anyone, including logged-out visitors and crawlers.
DROP POLICY IF EXISTS "portfolio_public_read" ON storage.objects;
CREATE POLICY "portfolio_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

-- Write: nobody, via the anon/publishable key. There is deliberately no INSERT,
-- UPDATE or DELETE policy for clients. Uploads go through our own route, which
-- checks the session, sniffs the actual file bytes, and picks the storage path
-- itself — using the service role, which bypasses RLS. A client that could
-- write directly could choose its own path and overwrite someone else's cover.
