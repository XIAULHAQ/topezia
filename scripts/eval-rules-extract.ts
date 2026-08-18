/**
 * How well does rules-first extraction (lib/ingestion/rules-extract.ts)
 * agree with the model on jobs the model has already labelled?
 *
 *   npx tsx scripts/eval-rules-extract.ts [--sample=1500]
 *
 * Reports: how often the rules fire at all (that is the saving), and on the
 * jobs where they fire, seniority agreement and skill overlap with the stored
 * model extraction. Read this before loosening any threshold in the rules.
 */
import { prisma } from "@/lib/prisma";
import { applyRulesPass } from "@/lib/ingestion/normalize-rules";
import { rulesFirstExtractionUnconditional as rulesFirstExtraction } from "@/lib/ingestion/rules-extract";

async function main() {
  const sampleArg = process.argv.find((a) => a.startsWith("--sample="));
  const sample = sampleArg ? parseInt(sampleArg.split("=")[1], 10) : 1500;

  const jobs = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Job" WHERE "titleNormalized" IS NOT NULL AND status = 'LIVE' ORDER BY random() LIMIT ${sample}`
  );
  let fired = 0, senAgree = 0, skillsModel = 0, skillsRules = 0, overlap = 0;
  const byVertical = new Map<string, number>();
  const disagreements: string[] = [];
  for (const { id } of jobs) {
    const j = await prisma.job.findUnique({
      where: { id },
      select: { titleRaw: true, descriptionRaw: true, locationRaw: true, seniority: true, vertical: { select: { slug: true } }, skills: { select: { skill: { select: { name: true } } } } },
    });
    if (!j) continue;
    const rules = applyRulesPass({ titleRaw: j.titleRaw, descriptionRaw: j.descriptionRaw, locationRaw: j.locationRaw, officeRaw: null });
    const r = await rulesFirstExtraction(j.titleRaw, rules.descriptionText);
    if (!r) continue;
    fired++;
    byVertical.set(r.vertical!, (byVertical.get(r.vertical!) ?? 0) + 1);
    if (r.seniority === j.seniority) senAgree++;
    else disagreements.push(`${j.titleRaw} — model ${j.seniority}, rules ${r.seniority}`);
    const m = new Set(j.skills.map((s) => s.skill.name.toLowerCase()));
    const rs = new Set(r.skills.map((s) => s.toLowerCase()));
    skillsModel += m.size; skillsRules += rs.size;
    for (const s of rs) if (m.has(s)) overlap++;
  }
  console.log(`sample ${jobs.length} model-labelled live jobs`);
  console.log(`rules fired: ${fired} (${Math.round((fired / jobs.length) * 100)}%)`);
  if (fired) {
    console.log(`seniority agreement: ${Math.round((senAgree / fired) * 100)}%`);
    console.log(`skills: model avg ${(skillsModel / fired).toFixed(1)}, rules avg ${(skillsRules / fired).toFixed(1)}, ${Math.round((overlap / skillsRules) * 100)}% of rules skills also in model's, ${Math.round((overlap / skillsModel) * 100)}% of model's skills recovered`);
    console.log(`by vertical: ${[...byVertical.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}:${n}`).join(" ")}`);
    console.log(`seniority disagreements (first 15):\n  ${disagreements.slice(0, 15).join("\n  ")}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
