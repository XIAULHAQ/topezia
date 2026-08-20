-- 085_job_invites — an employer inviting someone to apply.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-084).
--
-- WHY. Postings could only wait to be found. An employer who knows the right
-- person — or has just been shown them by the sourcing query — had no way to
-- say so.
--
-- TWO KINDS OF INVITEE, ONE TABLE. profileId for a Topezia member, email for
-- someone who is not one yet; exactly one is set. Splitting them into two
-- tables would duplicate the token, the status machine and every guardrail for
-- no gain, since the employer's list mixes both.
--
-- CONSENT IS UPSTREAM, AND STAYS THERE. Members are only reachable through the
-- sourcing query, which requires openToWork AND publicVisible
-- (lib/employer/sourcing.ts). This table adds no way to reach a member who has
-- not opted in to being found, and the invite endpoint re-checks rather than
-- trusting an id posted by the client.
--
-- ONE INVITATION PER PERSON PER POSTING, enforced by two unique indexes rather
-- than by the UI. Inviting the same candidate to the same job twice is how
-- outreach becomes nagging. NULLs are distinct in Postgres, so the profileId
-- index does not constrain email rows and vice versa — which is exactly what
-- is wanted here.
--
-- Additive and re-runnable.

DO $$ BEGIN
  CREATE TYPE "JobInviteStatus" AS ENUM ('PENDING', 'VIEWED', 'APPLIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "JobInvite" (
  "id"              TEXT NOT NULL,
  "jobId"           TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "profileId"       TEXT,
  "email"           TEXT,
  "name"            TEXT,
  "token"           TEXT NOT NULL,
  "status"          "JobInviteStatus" NOT NULL DEFAULT 'PENDING',
  "note"            TEXT,
  "sentAt"          TIMESTAMP(3),
  "sendError"       TEXT,
  "viewedAt"        TIMESTAMP(3),
  "respondedAt"     TIMESTAMP(3),
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobInvite_pkey" PRIMARY KEY ("id")
);

-- Exactly one of profileId / email. A row with neither could never be
-- delivered; a row with both would be two people wearing one token.
DO $$ BEGIN
  ALTER TABLE "JobInvite"
    ADD CONSTRAINT "JobInvite_one_recipient"
    CHECK (("profileId" IS NOT NULL AND "email" IS NULL)
        OR ("profileId" IS NULL AND "email" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "JobInvite_token_key" ON "JobInvite"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "JobInvite_jobId_profileId_key" ON "JobInvite"("jobId", "profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "JobInvite_jobId_email_key" ON "JobInvite"("jobId", "email");
CREATE INDEX IF NOT EXISTS "JobInvite_jobId_status_idx" ON "JobInvite"("jobId", "status");
CREATE INDEX IF NOT EXISTS "JobInvite_profileId_idx" ON "JobInvite"("profileId");

DO $$ BEGIN
  ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
