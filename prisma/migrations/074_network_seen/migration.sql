-- 074_network_seen — let the sidebar badge count acceptances, not just requests.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-073).
--
-- WHY A NEW COLUMN WHEN acceptNotifiedAt ALREADY EXISTS. They mean different
-- things and clearing a badge on the wrong one loses news:
--
--   acceptNotifiedAt — we put an email about this on the wire.
--   networkSeenAt    — the member opened /network.
--
-- An email leaving our server is not somebody reading it. If the badge cleared
-- on acceptNotifiedAt, the cron would silently switch off the in-app signal for
-- a member who never opened the mail — the one member who most needed the badge.
--
-- WHY ON Profile AND NOT PER ROW. "Have they seen this particular acceptance?"
-- is answerable from one timestamp plus the row's respondedAt, and a per-row
-- seen column would need writing for every visible row on every page load.
-- One column, one write per visit.
--
-- WHY THE TWO HALVES OF THE BADGE BEHAVE DIFFERENTLY. Pending requests are a
-- to-do list: the count stays until the member accepts or ignores, because
-- looking at a decision is not making it. Acceptances are news: they clear on
-- sight. Summing them gives one honest number — "things wanting your
-- attention".
--
-- THE BACKFILL, AGAIN THE POINT. Every existing profile is stamped as having
-- just looked. Without it, the first page load after deploy would show every
-- member a badge counting every connection they have ever made. Zero accepted
-- rows exist today, so this is a no-op; it is written because the empty case is
-- luck, not design. Same reasoning as 073.
--
-- Additive and re-runnable.

ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "networkSeenAt" TIMESTAMP(3);

-- Nobody gets a badge for a connection made before this shipped.
-- Idempotent: only touches rows still null, so re-running never resets a real
-- visit back to deploy time.
UPDATE "Profile"
   SET "networkSeenAt" = CURRENT_TIMESTAMP
 WHERE "networkSeenAt" IS NULL;
