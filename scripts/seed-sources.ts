/**
 * Seed a starter set of ATS boards into the Source table (spec §4.1).
 *
 * Run: npx tsx scripts/seed-sources.ts
 *
 * `npm run ingest` reads from Source — it does not discover boards on its own.
 * Founding-employer waitlist signups populate Source automatically, but until
 * those arrive this gives the pipeline something real to crawl. Idempotent:
 * upserts on the (type, companySlug) unique, so re-running is safe.
 *
 * Every slug below was verified to return HTTP 200 with live jobs at seed time
 * (2026-07). ATS boards come and go — if a crawl returns 0 jobs, re-verify the
 * slug rather than assuming a crawler bug.
 */

import { prisma } from "@/lib/prisma";
import { JobSource } from "@prisma/client";

const SEED_SOURCES: { type: JobSource; companySlug: string }[] = [
  { type: JobSource.GREENHOUSE, companySlug: "dropbox" },
  { type: JobSource.GREENHOUSE, companySlug: "discord" },
  { type: JobSource.ASHBY, companySlug: "posthog" },
  { type: JobSource.ASHBY, companySlug: "linear" },
  { type: JobSource.LEVER, companySlug: "leverdemo" },
];

async function main() {
  let created = 0;
  for (const s of SEED_SOURCES) {
    const existing = await prisma.source.findUnique({
      where: { type_companySlug: { type: s.type, companySlug: s.companySlug } },
      select: { id: true },
    });
    await prisma.source.upsert({
      where: { type_companySlug: { type: s.type, companySlug: s.companySlug } },
      update: {},
      create: { type: s.type, companySlug: s.companySlug, isPriority: false },
    });
    if (!existing) created++;
    console.log(`  ${existing ? "exists " : "created"}  ${s.type} / ${s.companySlug}`);
  }
  const total = await prisma.source.count();
  console.log(`\nDone. ${created} new, ${total} sources total.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
