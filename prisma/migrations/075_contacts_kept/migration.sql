-- 075_contacts_kept — imported contacts stay until the member deletes them.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-074).
--
-- WHY. The list was built to self-destruct: an hour at first, then a day. Both
-- were wrong for the actual job. A member with 600 contacts invites 50 at a
-- time, comes back tomorrow, and expects the list to still be there — Brandon
-- hit exactly this, invited one person, and lost the other 609.
--
-- WHY THIS IS FINE UNDER GOOGLE'S LIMITED USE RULES, having previously been
-- over-cautious about it. Limited Use governs WHAT the data may be used for:
-- only the user-facing feature it was collected for, no transfer, no
-- advertising, no human reading it. It does not require deleting data that is
-- still powering the very feature the member asked for. Keeping someone's
-- imported contacts so they can keep inviting from them IS that feature.
--
-- What the policy does demand, and what stays true:
--   * encrypted at rest (AES-256-GCM), unchanged
--   * used for nothing but this screen, unchanged
--   * never transferred, sold, advertised against, or read by a human
--   * DELETABLE ON DEMAND — /network gains an explicit control, and the row
--     still cascades when the profile is deleted
--
-- expiresAt becomes NULLABLE: null now means "keep until the member says
-- otherwise". Existing rows keep whatever timestamp they carry, so anything
-- imported under the old rules still expires as its owner was told it would.
-- The sweep only ever touches non-null values.

ALTER TABLE "ContactImport" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- Nothing to backfill on purpose: rows created under the old promise keep it.

-- One current list per member is what the UI now shows, so make finding it
-- cheap and make a stale duplicate obvious.
CREATE INDEX IF NOT EXISTS "ContactImport_profileId_idx"
  ON "ContactImport"("profileId");
