-- Add Skill.reviewed (spec §3.3 "LLM-discovered skills behind a review flag").
--
-- Kept as a hand-written migration (like 000/002) and applied via
-- `migrate resolve --applied` because this DB was baselined, not built up via
-- `migrate dev`. The column is also declared in schema.prisma so the Prisma
-- client is aware of it.
--
-- Defaults to false: existing rows (including LLM-created skills) become
-- unreviewed. The seed marks its canonical skills reviewed=true.
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "reviewed" BOOLEAN NOT NULL DEFAULT false;
