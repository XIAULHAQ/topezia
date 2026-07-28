-- Supabase Storage bucket for blog images (covers + in-body images).
-- Idempotent — safe to re-run.
--
-- Run with:
--   npx prisma db execute --url "$DIRECT_URL" --file scripts/setup-blog-storage.sql
--
-- This is infrastructure config, not app schema, so it lives here rather than
-- in prisma/migrations — but it is checked in so the bucket can be recreated
-- exactly rather than clicked together in a dashboard. Same shape as
-- scripts/setup-portfolio-storage.sql.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog',
  'blog',
  -- Public: blog images are meant to be seen and indexed, served straight
  -- from the CDN with no signing round-trip per image.
  true,
  -- 10MB. Generous for a cover/body image, mean enough to stop something
  -- absurd landing in the bucket.
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
DROP POLICY IF EXISTS "blog_public_read" ON storage.objects;
CREATE POLICY "blog_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog');

-- Write: nobody, via the anon/publishable key. There is deliberately no
-- INSERT, UPDATE or DELETE policy for clients. Uploads go through
-- /api/hq/blog/upload, which checks the /hq session, sniffs the actual file
-- bytes, and picks the storage path itself — using the service role, which
-- bypasses RLS.
