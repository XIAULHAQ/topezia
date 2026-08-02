-- 065_question_answers — keep BOTH sides of every conversation.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-064).
--
-- Until now the question log stored what visitors ASKED and nothing the
-- assistant said back. That was fine while it only fed the weekly digest,
-- and useless the day a real conversation had to be reconstructed: a
-- customer left her details in the chat, the lead was dropped, and half the
-- conversation — our half — simply did not exist anywhere.
--
-- A lead's transcript has always carried both sides. This closes the gap for
-- every OTHER conversation: the ones that never leave an address, which is
-- most of them.
--
-- sessionId groups the rows that belong to one chat. Without it a log is a
-- pile of questions and the only way to tell a conversation apart is to
-- guess from timestamps, which is exactly what had to be done by hand.
-- Random per chat session, never stable across visits — this identifies a
-- conversation, not a person.
--
-- Additive; both columns nullable, so every existing row stays valid and
-- honestly says "we did not record this".

ALTER TABLE "WidgetQuestion" ADD COLUMN IF NOT EXISTS "answer" TEXT;
ALTER TABLE "WidgetQuestion" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

CREATE INDEX IF NOT EXISTS "WidgetQuestion_sessionId_createdAt_idx"
  ON "WidgetQuestion"("sessionId", "createdAt");
