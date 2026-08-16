-- 077_error_log — errors the product hits, grouped, reviewed weekly, cleared.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-076).
--
-- WHY. Until now an error was a line in Vercel's log stream: gone in a day,
-- invisible unless someone was watching, impossible to say "is this still
-- happening?" about. Brandon asked for a log that is CHECKED every week,
-- FIXED, and CLEARED once fixed — which needs the errors to survive, to be
-- grouped (one row per distinct failure, not one per occurrence), and to
-- carry a status.
--
-- One row per FINGERPRINT (source + message + path, hashed). Repeat
-- occurrences bump `count` and `lastSeenAt` rather than adding rows, so the
-- weekly list is a dozen lines, not ten thousand. `status` is OPEN until
-- someone marks it RESOLVED; a resolved fingerprint that fires again is
-- reopened (regression, not a new bug). "Clear" deletes RESOLVED rows.
--
-- Written by lib/errors/log.ts from three places: server console.error
-- (instrumentation.ts hooks it), the client error reporter (/api/errors),
-- and explicit logError() calls. Read by /hq/errors and the Monday digest.

CREATE TABLE "ErrorLog" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "fingerprint"  TEXT NOT NULL UNIQUE,
  "source"       TEXT NOT NULL,            -- "server" | "client" | "api"
  "message"      TEXT NOT NULL,
  "stack"        TEXT,
  "path"         TEXT,                     -- route or page where it happened
  "meta"         JSONB,                    -- last occurrence's extra context
  "count"        INTEGER NOT NULL DEFAULT 1,
  "status"       TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | RESOLVED
  "note"         TEXT,                     -- what was done about it
  "firstSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"   TIMESTAMP(3)
);

CREATE INDEX "ErrorLog_status_lastSeenAt_idx" ON "ErrorLog"("status", "lastSeenAt");
