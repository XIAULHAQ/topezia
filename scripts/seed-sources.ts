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

// Real, live boards only. NOTE: `leverdemo` was removed — it's Lever's own
// sample board, so it served fake postings ("Account Executive (copy)", four
// identical "Account Executive" rows). Demo data must never reach real users or
// an alert email. `palantir` replaces it as the real Lever board.
//
// Beware: a dead Lever board returns HTTP 200 with an EMPTY array, not a 404
// (netflix, plaid and mistral all do this today). A crawler that silently
// returns 0 looks identical to a healthy board with nothing new, so re-verify
// the slug before blaming the crawler.
const SEED_SOURCES: { type: JobSource; companySlug: string; companyName: string }[] = [
  { type: JobSource.GREENHOUSE, companySlug: "dropbox", companyName: "Dropbox" },
  { type: JobSource.GREENHOUSE, companySlug: "discord", companyName: "Discord" },
  { type: JobSource.ASHBY, companySlug: "posthog", companyName: "PostHog" },
  { type: JobSource.ASHBY, companySlug: "linear", companyName: "Linear" },
  // 273 postings, 203 US (New York, Washington DC, Palo Alto), newest 2 days
  // old at seed time. Verified 2026-07-17: 0 missing fields, 0 duplicate
  // externalIds, no "(copy)" placeholders — i.e. everything leverdemo wasn't.
  { type: JobSource.LEVER, companySlug: "palantir", companyName: "Palantir Technologies" },
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
