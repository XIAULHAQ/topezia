/**
 * One-time (re-runnable) skill-taxonomy canonicalization.
 *
 * The resolver minted a new Skill for every unseen wording, so the table grew
 * to ~5k fragments ("SEO", "seo optimization", "seo & search optimization" all
 * separate). Every stat that joins profile skills to job skills — coverage %,
 * gaps, "X% want Y" — silently breaks on those missed joins.
 *
 * This script asks the LLM to group VARIANT WORDINGS of the same skill (never
 * merely-related skills), then merges each group into its most-used member:
 *   - JobSkill / ProfileSkill rows re-pointed (INSERT ... ON CONFLICT DO
 *     NOTHING + DELETE, so rows that already have the canonical skill don't
 *     violate the composite PK)
 *   - ProfileSkill keeps the strongest tier/proficiency semantics by simply
 *     keeping the existing canonical row when one exists
 *   - SkillAlias re-pointed and the variant's name added as a new alias, so
 *     the next résumé using that wording resolves straight to the canonical id
 *   - the emptied variant Skill row is deleted
 *
 * Run: npx tsx scripts/canonicalize-skills.ts [--dry-run] [--limit-batches=N]
 */

import { prisma } from "@/lib/prisma";

const MODEL = "claude-haiku-4-5-20251001";
const BATCH = 300; // skill names per LLM call

const SYSTEM = `You canonicalize a skill taxonomy for a job-matching platform. You get a numbered list of skill names.

Group ONLY variant wordings of the SAME skill — different spellings, casings, word orders, filler words, or a compound that contains exactly one real skill plus filler. Examples of valid groups:
- "SEO", "seo optimization", "search engine optimization", "SEO & search optimization"
- "Google Ads", "Google Adwords", "google adwords campaigns"
- "digital marketing", "digital marketing strategies"

NEVER group skills that are merely related or overlapping — these must stay separate:
- "email marketing" vs "marketing" (different scope)
- "React" vs "JavaScript" (different things)
- "content strategy" vs "content marketing" (adjacent, not identical)
- compounds naming TWO real skills ("PPC & Google Ads") — leave them alone.

Return ONLY a JSON array of groups; each group is an array of the exact input names (2+ entries). Skills with no variants are simply omitted. No prose.`;

async function llmGroups(names: string[]): Promise<string[][]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: names.map((n, i) => `${i + 1}. ${n}`).join("\n") }],
    }),
  });
  if (!res.ok) throw new Error(`canonicalize LLM failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "[]";
  const arr = JSON.parse(text.replace(/```json|```/g, "").trim()) as string[][];
  const known = new Set(names);
  // Trust nothing: keep only exact input names, groups of 2+.
  return arr
    .map((g) => (Array.isArray(g) ? g.filter((n) => typeof n === "string" && known.has(n)) : []))
    .filter((g) => g.length >= 2);
}

async function mergeGroup(group: { id: string; name: string; uses: number }[], dryRun: boolean): Promise<number> {
  // Canonical = most used; tie-break shortest name (canonical terms are short).
  const sorted = [...group].sort((a, b) => b.uses - a.uses || a.name.length - b.name.length);
  const canon = sorted[0];
  const variants = sorted.slice(1);
  if (variants.length === 0) return 0;
  console.log(`  "${canon.name}"  <=  ${variants.map((v) => `"${v.name}"`).join(", ")}`);
  if (dryRun) return variants.length;

  for (const v of variants) {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `INSERT INTO "JobSkill" ("jobId", "skillId", "isRequired")
         SELECT "jobId", $1, "isRequired" FROM "JobSkill" WHERE "skillId" = $2
         ON CONFLICT DO NOTHING`, canon.id, v.id
      ),
      prisma.$executeRawUnsafe(`DELETE FROM "JobSkill" WHERE "skillId" = $1`, v.id),
      prisma.$executeRawUnsafe(
        `INSERT INTO "ProfileSkill" ("profileId", "skillId", "confidence", "proficiency", "source", "tier")
         SELECT "profileId", $1, "confidence", "proficiency", "source", "tier" FROM "ProfileSkill" WHERE "skillId" = $2
         ON CONFLICT DO NOTHING`, canon.id, v.id
      ),
      prisma.$executeRawUnsafe(`DELETE FROM "ProfileSkill" WHERE "skillId" = $1`, v.id),
      // Re-point existing aliases, then remember the variant's own name as an
      // alias so future parses resolve straight to the canonical skill.
      prisma.$executeRawUnsafe(
        `UPDATE "SkillAlias" SET "skillId" = $1 WHERE "skillId" = $2
         AND "rawText" NOT IN (SELECT "rawText" FROM "SkillAlias" WHERE "skillId" = $1)`, canon.id, v.id
      ),
      prisma.$executeRawUnsafe(`DELETE FROM "SkillAlias" WHERE "skillId" = $1`, v.id),
      prisma.$executeRawUnsafe(
        `INSERT INTO "SkillAlias" ("id", "rawText", "skillId", "resolvedBy")
         VALUES (gen_random_uuid(), $1, $2, 'LLM') ON CONFLICT DO NOTHING`, v.name, canon.id
      ),
      prisma.$executeRawUnsafe(`DELETE FROM "Skill" WHERE "id" = $1`, v.id),
    ]);
  }
  return variants.length;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit-batches="));
  const limitBatches = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  const skills = await prisma.$queryRawUnsafe<{ id: string; name: string; uses: number }[]>(
    `SELECT s.id, s.name,
       (SELECT COUNT(*) FROM "JobSkill" js WHERE js."skillId" = s.id)::int +
       (SELECT COUNT(*) FROM "ProfileSkill" ps WHERE ps."skillId" = s.id)::int AS uses
     FROM "Skill" s ORDER BY lower(s.name)` // alphabetical: variants land in the same batch
  );
  console.log(`${skills.length} skills${dryRun ? " (DRY RUN)" : ""}`);
  const byName = new Map(skills.map((s) => [s.name, s]));

  let merged = 0, groups = 0, batchNo = 0;
  for (let i = 0; i < skills.length; i += BATCH) {
    if (++batchNo > limitBatches) break;
    const batch = skills.slice(i, i + BATCH);
    try {
      const found = await llmGroups(batch.map((s) => s.name));
      for (const g of found) {
        const rows = g.map((n) => byName.get(n)!).filter(Boolean);
        if (rows.length < 2) continue;
        groups++;
        merged += await mergeGroup(rows, dryRun);
      }
      console.log(`batch ${batchNo}/${Math.ceil(skills.length / BATCH)} done (${groups} groups so far)`);
    } catch (err) {
      console.error(`batch ${batchNo} failed (skipping):`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nDone. ${groups} groups, ${merged} variant skills merged${dryRun ? " (dry run — nothing written)" : ""}.`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
