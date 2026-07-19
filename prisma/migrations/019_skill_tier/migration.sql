-- Core vs secondary skills. CORE = what the person's roles were actually hired
-- to do (their professional identity); SECONDARY = real adjacent capabilities
-- ("I also build websites"). Matching, embeddings and stats lead with CORE;
-- secondary counts as "also knows" and never appears as a roadmap gap.
CREATE TYPE "SkillTier" AS ENUM ('CORE', 'SECONDARY');

ALTER TABLE "ProfileSkill" ADD COLUMN "tier" "SkillTier" NOT NULL DEFAULT 'CORE';
