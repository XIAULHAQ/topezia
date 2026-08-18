-- 080_llm_usage — one row per Anthropic call, for cost attribution.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-079).
--
-- WHY. Until now the AI bill was a single number in the Anthropic console.
-- Nine call sites, none of them read the `usage` block the API returns, so
-- "which feature costs what" was unanswerable. lib/llm.ts now routes every
-- call and writes one row here per call (fire-and-forget). /hq/ai-cost and
-- the Monday digest read it. Append-only; no foreign keys on purpose — a
-- deleted site or profile must not cascade away its spend history, and the
-- insert must never wait on another table.

CREATE TABLE "LlmUsage" (
  "id"               TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "feature"          TEXT NOT NULL,             -- e.g. "widget.answer"
  "bucket"           TEXT NOT NULL,             -- widget | ingestion | member | ops
  "model"            TEXT NOT NULL,
  "inputTokens"      INTEGER NOT NULL DEFAULT 0,
  "outputTokens"     INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens"  INTEGER NOT NULL DEFAULT 0,
  "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd"          DOUBLE PRECISION,          -- estimated at write time; NULL = unknown model
  "latencyMs"        INTEGER NOT NULL,
  "ok"               BOOLEAN NOT NULL,
  "status"           INTEGER,                   -- HTTP status; NULL = network failure
  "stream"           BOOLEAN NOT NULL DEFAULT false,
  "siteId"           TEXT,
  "companyId"        TEXT,
  "profileId"        TEXT
);

CREATE INDEX "LlmUsage_createdAt_idx" ON "LlmUsage"("createdAt");
CREATE INDEX "LlmUsage_feature_createdAt_idx" ON "LlmUsage"("feature", "createdAt");
CREATE INDEX "LlmUsage_siteId_createdAt_idx" ON "LlmUsage"("siteId", "createdAt");
