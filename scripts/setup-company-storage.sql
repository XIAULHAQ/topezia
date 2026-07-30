-- Supabase Storage bucket for company work images and article covers.
-- Idempotent — safe to re-run.
--
-- Run with:
--   npx prisma db execute --url "$DIRECT_URL" --file scripts/setup-company-storage.sql
--
-- Same shape and same reasoning as scripts/setup-portfolio-storage.sql; see
-- that file for the full rationale on public buckets, the MIME allow-list and
-- why clients get no write policy.
--
-- Its own bucket rather than a folder in `portfolio` or `logos`, for the same
-- reason those two are separate: the portfolio delete path removes objects by
-- profileId prefix and the logo path by companyId, so sharing a bucket would
-- let one feature's cleanup delete another's files.
--
-- Client LOGOS are the exception and deliberately live in `logos` under
-- "{companyId}/clients/" — they are logos, they are small, and they are
-- deleted by the same company-scoped path the company's own logo uses.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company',
  'company',
  -- Public: work and articles exist to be seen, shared with a prospect who has
  -- no account, and indexed.
  true,
  -- 10MB, matching `portfolio`. A case-study still is a photograph, not a mark.
  10485760,
  -- Raster only. No SVG: it is an executable document and serving one from our
  -- own origin would be stored XSS.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Read: anyone, including logged-out visitors and crawlers.
DROP POLICY IF EXISTS "company_public_read" ON storage.objects;
CREATE POLICY "company_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company');

-- Write: nobody via the anon key. There is deliberately no INSERT, UPDATE or
-- DELETE policy for clients. Uploads go through app/api/company/image, which
-- checks company ownership, sniffs the real file bytes and picks the storage
-- path itself — using the service role, which bypasses RLS. A client that
-- could write directly could choose its own path and overwrite another
-- company's cover.
