-- 072_connection_notifications — tell people when someone asks to connect.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-071).
--
-- WHY Connection."notifiedAt" AND NOT A STAMP ON THE PROFILE. A "last notified
-- at" column on Profile can answer "have we emailed this person recently?" but
-- not "which requests has this person been told about?". Three requests that
-- arrive together should produce ONE email; a fourth arriving an hour later is
-- new news. Only a per-request mark gets both right.
--
-- WHY connectionEmails DEFAULTS TRUE. Every other email preference in this
-- product defaults false, because every other one is something we decided to
-- send. This one is a named human asking this member a direct question and
-- waiting on an answer. Defaulting it off would mean requests silently pile up
-- unseen, which is the failure this migration exists to prevent. One click
-- turns it off, from the email or from /settings.
--
-- WHY A SECOND UNSUBSCRIBE TOKEN. insightUnsubToken already exists, and reusing
-- it would mean unsubscribing from connection mail also killed insight alerts
-- (or vice versa) — one link quietly doing two things nobody asked for.
--
-- BACKFILL SAFETY. notifyUnsubToken is added nullable, filled for every
-- existing row, and only then made NOT NULL and unique. Doing it in one step
-- would fail on any database that already has profiles — which is all of them.
-- gen_random_uuid() is core Postgres from 13 onward; Supabase is well past it.
--
-- Additive and re-runnable.

-- ── Which requests has the addressee already been told about? ───────────────

ALTER TABLE "Connection" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);

-- The notifier's working set: pending requests nobody has been told about.
CREATE INDEX IF NOT EXISTS "Connection_status_notifiedAt_idx"
  ON "Connection"("status", "notifiedAt");

-- ── Per-member preference and its opt-out token ────────────────────────────

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "connectionEmails" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "notifyUnsubToken" TEXT;

-- Backfill before the constraints. Idempotent: only touches rows still null,
-- so re-running never reissues a token somebody already has in their inbox.
UPDATE "Profile"
   SET "notifyUnsubToken" = gen_random_uuid()::text
 WHERE "notifyUnsubToken" IS NULL;

DO $$ BEGIN
  ALTER TABLE "Profile" ALTER COLUMN "notifyUnsubToken" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Profile_notifyUnsubToken_key"
  ON "Profile"("notifyUnsubToken");
