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

const SEED_SOURCES: { type: JobSource; companySlug: string; companyName: string }[] = [
  { type: JobSource.GREENHOUSE, companySlug: "dropbox", companyName: "Dropbox" },
  { type: JobSource.GREENHOUSE, companySlug: "discord", companyName: "Discord" },
  { type: JobSource.ASHBY, companySlug: "posthog", companyName: "PostHog" },
  { type: JobSource.ASHBY, companySlug: "linear", companyName: "Linear" },
  { type: JobSource.LEVER, companySlug: "leverdemo", companyName: "Lever Demo" },
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
      update: { companyName: s.companyName },
      create: { type: s.type, companySlug: s.companySlug, companyName: s.companyName, isPriority: false },
    });
    if (!existing) created++;
    console.log(`  ${existing ? "updated" : "created"}  ${s.type} / ${s.companySlug} → ${s.companyName}`);
  }
  const total = await prisma.source.count();
  console.log(`\nDone. ${created} new, ${total} sources total.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
