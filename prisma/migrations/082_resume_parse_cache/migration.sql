-- 082_resume_parse_cache — parse each resume once (strategy §3.5).
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-081).
--
-- WHY. Resume parsing is the most expensive single call in the product
-- (text ≈ $0.012; a scanned PDF, sent as a document block, $0.03–0.10+),
-- and people re-upload: a second draft of the same file, a retry after a
-- network blip, the same resume from a phone and a laptop. Keyed by a hash
-- of the content plus the prompt version — never by who uploaded it — so
-- identical input returns the stored structured output and a prompt change
-- invalidates everything at once. No file is stored. 30-day expiry keeps a
-- parse that never became a profile from lingering; no FK, nothing cascades.

CREATE TABLE IF NOT EXISTS "ResumeParseCache" (
  "hash"          TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "parsed"        JSONB NOT NULL,
  "transcription" TEXT,
  "photoBox"      JSONB,
  "hits"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResumeParseCache_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX IF NOT EXISTS "ResumeParseCache_expiresAt_idx" ON "ResumeParseCache"("expiresAt");
ALTER TABLE "ResumeParseCache" ENABLE ROW LEVEL SECURITY;
