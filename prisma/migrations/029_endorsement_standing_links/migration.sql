-- Standing invite links. An invite (PENDING row) is now reusable: each
-- submission becomes its own SUBMITTED row pointing back via inviteId, and
-- one signed-in account can answer a given invite exactly once (the unique
-- index below is the lock). Deleting the invite revokes the link; responses
-- survive because the FK sets null.
--
-- Hand-written, applied with `prisma db execute` — see CAVEATS.md.

ALTER TABLE "Endorsement"
  ADD COLUMN "inviteId" TEXT REFERENCES "Endorsement"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "Endorsement_inviteId_authorUserId_key"
  ON "Endorsement"("inviteId", "authorUserId");

-- Open requests stop expiring: sign-in + revocation replaced the expiry date
-- as the abuse control. Far-future sentinel rather than NULL so nothing that
-- compares against expiresAt needs a null branch.
UPDATE "Endorsement" SET "expiresAt" = '2100-01-01T00:00:00Z' WHERE "status" = 'PENDING';
