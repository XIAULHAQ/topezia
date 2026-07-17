/**
 * One-off repair: collapse Job rows that are the same posting.
 *
 * Ingestion used to decide "have I seen this?" purely from a hash of the
 * NORMALIZED description. That made dedup a function of our own extraction
 * code: when the Greenhouse entity-decoding fix changed how descriptions
 * normalize, every previously-ingested Greenhouse job hashed differently,
 * looked brand new, and was inserted a second time.
 *
 * Identity is now (source, sourceCompanySlug, externalId) — the source's own
 * stable id for the posting — enforced by a unique index. This script clears
 * the collisions that predate that index so it can be created.
 *
 * Keeps the OLDEST row (its createdAt is the true first-seen time) and deletes
 * the newer ones. The survivor's stale descriptionHash is left alone on
 * purpose: the next ingest finds it by identity, sees the hash differ, and
 * refreshes it in place — the self-healing path this repair exists to enable.
 *
 * Safe to re-run; a no-op once there are no collisions.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");

  const collisions = await prisma.$queryRawUnsafe<
    { source: string; sourceCompanySlug: string | null; externalId: string; n: number }[]
  >(`SELECT source::text, "sourceCompanySlug", "externalId", COUNT(*)::int AS n
     FROM "Job" WHERE "externalId" IS NOT NULL
     GROUP BY source, "sourceCompanySlug", "externalId" HAVING COUNT(*) > 1`);

  if (collisions.length === 0) {
    console.log("No identity collisions. Nothing to do.");
    return;
  }

  console.log(`${collisions.length} colliding identities.${apply ? "" : "  (dry run — pass --apply to delete)"}\n`);
  let deleted = 0;

  for (const c of collisions) {
    const rows = await prisma.job.findMany({
      where: { source: c.source as never, sourceCompanySlug: c.sourceCompanySlug, externalId: c.externalId },
      select: { id: true, titleRaw: true, createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    const [keep, ...drop] = rows;
    console.log(`${c.sourceCompanySlug}/${c.externalId} — ${rows[0].titleRaw}`);
    console.log(`  keep   ${keep.id.slice(0, 8)} (${keep.createdAt.toISOString().slice(0, 16)}, ${keep.status})`);

    for (const d of drop) {
      // Clicks are CPC attribution — never delete a row that has revenue
      // history attached just because it's a duplicate. Reassign to the
      // survivor instead, which is the same posting anyway.
      const clicks = await prisma.jobClick.count({ where: { jobId: d.id } });
      console.log(`  delete ${d.id.slice(0, 8)} (${d.createdAt.toISOString().slice(0, 16)}, ${d.status})${clicks ? ` — moving ${clicks} click(s) to survivor` : ""}`);
      if (!apply) continue;
      if (clicks > 0) await prisma.jobClick.updateMany({ where: { jobId: d.id }, data: { jobId: keep.id } });
      await prisma.job.delete({ where: { id: d.id } }); // JobSkill + MatchScore cascade
      deleted++;
    }
  }

  console.log(apply ? `\nDeleted ${deleted} duplicate row(s).` : `\nDry run — nothing changed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
