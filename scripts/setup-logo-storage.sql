-- Supabase Storage bucket for company logos. Idempotent — safe to re-run.
--
-- Run with:
--   npx prisma db execute --url "$DIRECT_URL" --file scripts/setup-logo-storage.sql
--
-- Same shape and same reasoning as scripts/setup-portfolio-storage.sql; see
-- that file for the full rationale on public buckets, the MIME allow-list and
-- why clients get no write policy.
--
-- Its own bucket rather than a folder inside `portfolio`: the portfolio delete
-- path removes objects by profileId prefix, and a company logo is owned by a
-- Company, not a Profile. Sharing the bucket would let one feature's cleanup
-- delete the other's files.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  -- Public: a logo appears on the company page, on job postings and in search
  -- results. All of that is meant to be seen and indexed.
  true,
  -- 2MB. A logo is a small mark, not a photograph — a tighter cap than the
  -- portfolio bucket because nothing legitimate here needs 10MB.
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
DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

-- Write: nobody via the anon key. Uploads go through app/api/company/logo,
-- which checks ownership, sniffs the real file bytes and picks the path itself.
