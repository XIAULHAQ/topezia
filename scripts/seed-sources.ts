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

  // Non-US boards. The index is global (spec §2) but every source was a US/EU
  // company board, so a seeker outside the US saw almost nothing — the feed
  // filter was honest and the inventory simply wasn't there. All eight verified
  // 2026-07-17 with the real crawlers: 0 missing fields, 0 "(copy)"/demo
  // titles, unique externalIds throughout, and locations that resolve to a
  // country. Between them they cover ~35 countries.
  { type: JobSource.GREENHOUSE, companySlug: "monzo", companyName: "Monzo" },            // 68  · GB, ES, IE
  { type: JobSource.GREENHOUSE, companySlug: "n26", companyName: "N26" },                // 74  · DE, ES, FR, IT
  { type: JobSource.GREENHOUSE, companySlug: "wolt", companyName: "Wolt" },              // 284 · 28 countries across Europe + Central Asia
  { type: JobSource.ASHBY, companySlug: "deliveroo", companyName: "Deliveroo" },         // 188 · GB, AE, FR, IT, IE, BE, IN, KW
  { type: JobSource.ASHBY, companySlug: "xero", companyName: "Xero" },                   // 90  · AU, NZ, GB, ZA, SG, CA, US
  { type: JobSource.ASHBY, companySlug: "wealthsimple", companyName: "Wealthsimple" },   // 38  · CA
  { type: JobSource.LEVER, companySlug: "meesho", companyName: "Meesho" },               // 44  · IN
  { type: JobSource.LEVER, companySlug: "qonto", companyName: "Qonto" },                 // 50  · FR, ES, DE, IT, BE, RS

  // US-focused expansion (2026-07-18): US-heavy boards with real marketing/design
  // volume, to grow inventory in our launch market. All verified with the real
  // crawlers: 0 missing fields, 0 "(copy)"/demo titles, unique externalIds.
  { type: JobSource.GREENHOUSE, companySlug: "reddit", companyName: "Reddit" },
  { type: JobSource.GREENHOUSE, companySlug: "pinterest", companyName: "Pinterest" },
  { type: JobSource.GREENHOUSE, companySlug: "roblox", companyName: "Roblox" },
  { type: JobSource.GREENHOUSE, companySlug: "samsara", companyName: "Samsara" },
  { type: JobSource.GREENHOUSE, companySlug: "instacart", companyName: "Instacart" },
  { type: JobSource.GREENHOUSE, companySlug: "twilio", companyName: "Twilio" },
  { type: JobSource.GREENHOUSE, companySlug: "coinbase", companyName: "Coinbase" },
  { type: JobSource.GREENHOUSE, companySlug: "robinhood", companyName: "Robinhood" },
  { type: JobSource.GREENHOUSE, companySlug: "affirm", companyName: "Affirm" },
  { type: JobSource.GREENHOUSE, companySlug: "chime", companyName: "Chime" },
  { type: JobSource.GREENHOUSE, companySlug: "mercury", companyName: "Mercury" },
  { type: JobSource.ASHBY, companySlug: "ramp", companyName: "Ramp" },

  // Real CDL / commercial-driving inventory (2026-07-18). Until now the
  // "trucking-logistics" vertical held ~0 actual driving jobs — the LIVE rows
  // there were misclassified warehouse/last-mile/telematics ops (Samsara,
  // Deliveroo, Meesho). The /drive questionnaire (spec §3.4) had nothing real
  // to match against. These boards post genuine CDL truck-driver, delivery/route
  // driver, and autonomous-vehicle CDL safety/test-driver roles. All verified
  // 2026-07-18 against the live crawlers: 0 dup externalIds, 0 missing
  // title/location/description/id, 0 "(copy)"/demo placeholders. Real US
  // locations throughout. Driver-title counts noted are the CDL/driving subset;
  // the balance of each board (warehouse, AV engineering, ops) classifies into
  // its own vertical once the tightened classifier runs. NOTE: none of the big
  // OTR carriers (Swift/Schneider/Werner/JB Hunt) publish on Greenhouse/Lever/
  // Ashby, so the honest CDL inventory available on these ATSs is grocery/
  // meal-kit local & regional CDL delivery plus autonomous-truck safety drivers.
  { type: JobSource.GREENHOUSE, companySlug: "misfitsmarket", companyName: "Misfits Market" }, // 93 jobs · 28 driving: CDL A/B, Class C & (Lead/PT) Delivery Drivers · US
  { type: JobSource.GREENHOUSE, companySlug: "stackav", companyName: "Stack AV" },             // 20 jobs · 8 CDL-A "Operations Specialist" driving roles · US (TN, CO, GA, IL, AZ, FL, TX)
  { type: JobSource.GREENHOUSE, companySlug: "kodiak", companyName: "Kodiak Robotics" },       // 73 jobs · 7 driving: Class A CDL & Class A Safety Drivers · US (TX, SF Bay)
  { type: JobSource.GREENHOUSE, companySlug: "outrider", companyName: "Outrider" },            // 10 jobs · 3 driving: CDL-A Autonomous Vehicle Test Operators / Site Lead · San Antonio, TX
  { type: JobSource.LEVER, companySlug: "waabi", companyName: "Waabi" },                       // 56 jobs · 1 driving: Vehicle Operator (CDL) · Dallas, TX
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