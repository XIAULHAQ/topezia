-- 073_accept_notifications — tell the asker when someone says yes.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-072).
--
-- WHY A SECOND COLUMN AND NOT A REUSE OF notifiedAt. The two facts are told to
-- OPPOSITE ENDS of the same row: notifiedAt means "the addressee has been told
-- somebody asked", acceptNotifiedAt means "the requester has been told they
-- said yes". One stamp could not express which end had heard, and a row is
-- legitimately in both states at once — an addressee told about the request,
-- then the requester told about the acceptance.
--
-- THIS ALSO COVERS THE INVITATION CASE. An emailed invitation that gets
-- accepted becomes an ACCEPTED edge whose requester is the inviter (see
-- app/api/network/accept/route.ts), so "tell the requester" is the same
-- mechanism for "your request was accepted" and "the person you invited
-- joined". The email distinguishes them by fromInviteId; the plumbing does not
-- need to.
--
-- THE BACKFILL IS THE POINT, NOT AN AFTERTHOUGHT. Every already-ACCEPTED edge
-- is marked as though it had been notified. Without this, the first cron run
-- after deploy would email every member about every connection they have ever
-- made — a backlog blast that reads as a bug to the recipient and as spam to
-- Gmail. There are zero accepted rows in production today, so this is currently
-- a no-op; it is written anyway because "it happened to be empty" is not a
-- migration strategy.
--
-- Additive and re-runnable.

ALTER TABLE "Connection" ADD COLUMN IF NOT EXISTS "acceptNotifiedAt" TIMESTAMP(3);

-- Nobody hears about a connection that was already made before this shipped.
-- Idempotent: only touches rows still null, so re-running never re-stamps.
UPDATE "Connection"
   SET "acceptNotifiedAt" = CURRENT_TIMESTAMP
 WHERE "status" = 'ACCEPTED'
   AND "acceptNotifiedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Connection_status_acceptNotifiedAt_idx"
  ON "Connection"("status", "acceptNotifiedAt");
