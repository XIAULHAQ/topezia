-- 071_network_connections — the member graph, contact import, and invitations.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-070).
--
-- WHAT THIS ADDS. Members can say they know each other, find the people they
-- already know, and invite the ones who are not here yet.
--
-- WHY MUTUAL ACCEPT. A follower graph would let anyone build a list of people
-- who never agreed to be on it, and the invitation emails ("X wants to connect
-- with you") would then be false. One row per pair, created PENDING by the
-- asker and flipped to ACCEPTED by the other person.
--
-- WHY ONE ROW PER PAIR, NOT TWO. Two rows means every "are we connected?"
-- check is an OR across two columns and every write has to keep a mirror in
-- step. One row, direction preserved for honesty, and a reciprocal request
-- resolved in application code as an acceptance (lib/network/connections.ts).
--
-- WHY ContactImport HOLDS ENCRYPTED BYTES AND EXPIRES. It is somebody else's
-- address book. Google's Limited Use rules allow keeping it only as long as
-- the feature needs it, and the feature needs it for exactly one page load
-- (the OAuth redirect cannot hand JSON back to the tab that started it, and
-- serverless instances share no memory). So: AES-256-GCM at rest, consumed
-- once, deleted on completion, swept on a TTL regardless.
--
-- Additive. Nothing here touches an existing table's data; the only change to
-- an existing table is none at all — Profile's new relations are virtual.
-- Safe to run twice.

-- ── The graph ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NetworkInviteStatus" AS ENUM ('PENDING', 'ACCEPTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "NetworkInvite" (
  "id"         TEXT NOT NULL,
  "inviterId"  TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "name"       TEXT,
  "token"      TEXT NOT NULL,
  "status"     "NetworkInviteStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt"     TIMESTAMP(3),
  "sendError"  TEXT,
  "acceptedAt" TIMESTAMP(3),
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetworkInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Connection" (
  "id"           TEXT NOT NULL,
  "requesterId"  TEXT NOT NULL,
  "addresseeId"  TEXT NOT NULL,
  "status"       "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "note"         TEXT,
  "fromInviteId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt"  TIMESTAMP(3),
  CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- Nobody connects to themselves. Cheap to enforce here, and it makes the
-- application-side check a belt-and-braces rather than the only guard.
DO $$ BEGIN
  ALTER TABLE "Connection"
    ADD CONSTRAINT "Connection_not_self" CHECK ("requesterId" <> "addresseeId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContactImport" (
  "id"         TEXT NOT NULL,
  "profileId"  TEXT NOT NULL,
  "source"     TEXT NOT NULL DEFAULT 'GOOGLE',
  "payload"    TEXT NOT NULL,
  "total"      INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteSuppression" (
  "email"     TEXT NOT NULL,
  "reason"    TEXT NOT NULL DEFAULT 'unsubscribed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InviteSuppression_pkey" PRIMARY KEY ("email")
);

-- ── Keys and indexes ─────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "NetworkInvite_token_key"
  ON "NetworkInvite"("token");
-- One invitation per address per inviter, EVER — not "one outstanding".
-- Re-inviting the same person is the exact behaviour that makes a network
-- product feel like spam, so the database refuses it rather than the UI.
CREATE UNIQUE INDEX IF NOT EXISTS "NetworkInvite_inviterId_email_key"
  ON "NetworkInvite"("inviterId", "email");
CREATE INDEX IF NOT EXISTS "NetworkInvite_inviterId_status_idx"
  ON "NetworkInvite"("inviterId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "Connection_requesterId_addresseeId_key"
  ON "Connection"("requesterId", "addresseeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Connection_fromInviteId_key"
  ON "Connection"("fromInviteId");
CREATE INDEX IF NOT EXISTS "Connection_addresseeId_status_idx"
  ON "Connection"("addresseeId", "status");
CREATE INDEX IF NOT EXISTS "Connection_requesterId_status_idx"
  ON "Connection"("requesterId", "status");

CREATE INDEX IF NOT EXISTS "ContactImport_profileId_createdAt_idx"
  ON "ContactImport"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactImport_expiresAt_idx"
  ON "ContactImport"("expiresAt");

-- ── Foreign keys ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "NetworkInvite"
    ADD CONSTRAINT "NetworkInvite_inviterId_fkey"
    FOREIGN KEY ("inviterId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Connection"
    ADD CONSTRAINT "Connection_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Connection"
    ADD CONSTRAINT "Connection_addresseeId_fkey"
    FOREIGN KEY ("addresseeId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull, not Cascade: an invitation can be cleaned up without destroying the
-- connection it produced. The edge is the real thing; the invite is how it
-- started.
DO $$ BEGIN
  ALTER TABLE "Connection"
    ADD CONSTRAINT "Connection_fromInviteId_fkey"
    FOREIGN KEY ("fromInviteId") REFERENCES "NetworkInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactImport"
    ADD CONSTRAINT "ContactImport_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
