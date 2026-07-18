/**
 * Re-run the LLM vertical classifier over already-ingested jobs — spec §4.2.
 *
 * Why this exists: `extractWithLlm` caches on `descriptionHash`, so changing the
 * classifier PROMPT does NOT reclassify jobs already in the DB — a re-crawl of
 * unchanged text hits the cache and keeps the old vertical. This script forces a
 * fresh classification (extractWithLlm(..., { skipCache: true })) for a targeted
 * set and updates only `verticalId`. Skills/seniority/embeddings are left alone.
 *
 * Scope: LIVE jobs in --vertical (default trucking-logistics) that were placed by
 * the LLM, i.e. roleId IS NULL. Role-resolved jobs are authoritative (hand-mapped
 * verticals in the seed) and are never touched.
 *
 * Run (dry-run — prints old -> new, writes nothing):
 *   npx tsx scripts/reclassify-verticals.ts
 *   npx tsx scripts/reclassify-verticals.ts --vertical=trucking-logistics
 * Apply the changes:
 *   npx tsx scripts/reclassify-verticals.ts --apply
 */

import { prisma } from "@/lib/prisma";
import { applyRulesPass } from "@/lib/ingestion/normalize-rules";
import { extractWithLlm } from "@/lib/ingestion/llm-extract";

async function main() {
  const apply = process.argv.includes("--apply");
  const vertArg = process.argv.find((a) => a.startsWith("--vertical="));
  const fromSlug = vertArg ? vertArg.split("=")[1] : "trucking-logistics";

  const fromVertical = await prisma.vertical.findUnique({ where: { slug: fromSlug }, select: { id: true } });
  if (!fromVertical) throw new Error(`Vertical not found: ${fromSlug}`);

  // slug -> id for every vertical, to resolve the model's answer to a row.
  const verticals = await prisma.vertical.findMany({ select: { id: true, slug: true } });
  const idBySlug = new Map(verticals.map((v) => [v.slug, v.id]));

  const jobs = await prisma.job.findMany({
    where: { verticalId: fromVertical.id, status: "LIVE", roleId: null },
    select: { id: true, titleRaw: true, descriptionRaw: true, locationRaw: true, companyName: true },
    orderBy: { companyName: "asc" },
  });

  console.log(`${apply ? "APPLY" : "DRY-RUN"} — reclassifying ${jobs.length} LLM-placed LIVE jobs currently in "${fromSlug}"\n`);

  const moved: Record<string, number> = {};
  let unchanged = 0, nullResult = 0, failed = 0;

  for (const j of jobs) {
    let newSlug: string | null = null;
    try {
      const rules = applyRulesPass({ titleRaw: j.titleRaw, descriptionRaw: j.descriptionRaw, locationRaw: j.locationRaw });
      const res = await extractWithLlm(j.titleRaw, rules.descriptionText, { skipCache: true });
      newSlug = res.vertical;
    } catch (err) {
      failed++;
      console.error(`  ! FAILED "${j.titleRaw}":`, err instanceof Error ? err.message : err);
      continue;
    }

    const targetId = newSlug ? idBySlug.get(newSlug) : undefined;
    const tag = `[${j.companyName}] ${j.titleRaw}`;

    if (!newSlug || !targetId) {
      nullResult++;
      console.log(`  ~ ${fromSlug} -> (model returned ${newSlug ?? "null"}, unknown slug) — leaving as-is :: ${tag}`);
      continue;
    }
    if (newSlug === fromSlug) {
      unchanged++;
      console.log(`  = ${fromSlug} (kept) :: ${tag}`);
      continue;
    }

    moved[newSlug] = (moved[newSlug] || 0) + 1;
    console.log(`  -> ${fromSlug} => ${newSlug} :: ${tag}`);
    if (apply) {
      await prisma.job.update({ where: { id: j.id }, data: { verticalId: targetId } });
    }
  }

  console.log(`\nSummary (${apply ? "applied" : "dry-run"}): ${Object.entries(moved).map(([k, v]) => `${v}->${k}`).join(", ") || "no moves"}` +
    `; kept=${unchanged}, null/unknown=${nullResult}, failed=${failed}`);
  if (!apply && Object.keys(moved).length) console.log(`Re-run with --apply to write these changes.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
