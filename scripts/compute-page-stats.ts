/**
 * Recompute PageStats for every programmatic SEO scope.
 *
 * Run: npx tsx scripts/compute-page-stats.ts [--dry-run]
 *
 * Normally this runs at the END of the ingestion run (scripts/run-ingestion.ts),
 * not on its own — the stats only move when listings move. This entry point
 * exists for the first backfill and for re-running after a query change without
 * waiting for a crawl.
 *
 * Safe to run against production: aggregate SELECTs plus upserts into PageStats,
 * so it never blocks live readers and touches no other table.
 */
import { prisma } from "@/lib/prisma";
import { computeAllPageStats, scopeDefs } from "@/lib/seo/page-stats";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const started = Date.now();

  if (dryRun) {
    console.log(`Dry run: ${scopeDefs().length} scope families; nothing will be written.`);
    await prisma.$disconnect();
    return;
  }

  console.log("Computing page stats…");
  const { written, removed } = await computeAllPageStats((m) => console.log(m));
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone in ${secs}s. ${written} page-stat rows written, ${removed} stale rows removed.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
