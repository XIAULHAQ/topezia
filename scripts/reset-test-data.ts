/**
 * Reset ingested job data back to a clean, post-seed state.
 *
 * Run: npx tsx scripts/reset-test-data.ts && npm run db:seed
 *
 * Deletes all jobs and the signals/skills that accumulate from ingestion, so a
 * re-seed + re-ingest starts fresh. Does NOT touch Source rows (crawl targets)
 * or Verticals/Roles (re-seed upserts those). Intended for test/dev resets, not
 * production data loss — it will happily wipe the Job table, so don't point it
 * at a live index you care about.
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const before = {
    jobs: await prisma.job.count(),
    skills: await prisma.skill.count(),
    roleAliases: await prisma.roleAlias.count(),
  };

  // Order matters for FKs: signals + JobSkill (cascade) before Job; SkillAlias
  // before Skill; keep MANUAL role aliases (seed owns them), drop learned ones.
  await prisma.jobClick.deleteMany({});
  await prisma.jobSave.deleteMany({});
  await prisma.jobDismissal.deleteMany({});
  await prisma.job.deleteMany({}); // cascades JobSkill
  await prisma.skillAlias.deleteMany({});
  await prisma.skill.deleteMany({});
  await prisma.roleAlias.deleteMany({ where: { resolvedBy: { not: "MANUAL" } } });

  const after = {
    jobs: await prisma.job.count(),
    skills: await prisma.skill.count(),
    roleAliases: await prisma.roleAlias.count(),
  };
  console.log("before:", before);
  console.log("after: ", after);
  console.log("\nNow run:  npm run db:seed   (recreates canonical skills + expanded roles)");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
