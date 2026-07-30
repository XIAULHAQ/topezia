-- Supabase Storage bucket for publication cover thumbnails. Idempotent — safe
-- to re-run.
--
-- Run with:
--   npx prisma db execute --url "$DIRECT_URL" --file scripts/setup-publication-storage.sql
--
-- Same shape and same reasoning as scripts/setup-logo-storage.sql; see
-- scripts/setup-portfolio-storage.sql for the full rationale on public buckets,
-- the MIME allow-list and why clients get no write policy.
--
-- Its own bucket rather than a folder inside `portfolio`: the portfolio delete
-- path removes objects by profileId prefix, and both features key on profileId,
-- so sharing one bucket would let deleting a portfolio piece take a book cover
-- with it.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'publications',
  'publications',
  -- Public: a book cover appears on the member's public profile, which is meant
  -- to be seen and indexed.
  true,
  -- 2MB. A cover thumbnail is a small image, not a print-resolution jacket.
  2097152,
  -- Raster only. No SVG: it is an executable document and serving it from our
  -- own origin would be stored XSS.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Read: anyone, including logged-out visitors and crawlers.
DROP POLICY IF EXISTS "publications_public_read" ON storage.objects;
CREATE POLICY "publications_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'publications');

-- Write: nobody via the anon key. Uploads go through
-- app/api/publications/image, which checks ownership of the publication row,
-- sniffs the real file bytes and picks the path itself.
