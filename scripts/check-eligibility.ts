/**
 * Sanity-check the work-eligibility rules against the live corpus.
 *
 * Two things worth checking before this ships:
 *  1. The sponsorship-refusal regex — how often it fires, and whether the
 *     sentences it fires on really are refusals (printed for eyeballing).
 *     A false positive here HIDES a real job, so precision matters more
 *     than recall.
 *  2. The scenarios themselves: how many jobs each kind of person can see.
 */
import { prisma } from "@/lib/prisma";
import {
  NO_SPONSORSHIP_RX, refusesSponsorship, workContext, targetCountries,
  eligibilitySql, eligibilityParams, geoNote,
} from "@/lib/matching/eligibility";

async function main() {
  // ── 1. Refusal detection across live US postings ──
  const [{ total, refusing }] = await prisma.$queryRawUnsafe<{ total: number; refusing: number }[]>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "descriptionRaw" ~* $1)::int AS refusing
     FROM "Job" WHERE status = 'LIVE' AND country = 'US'`,
    NO_SPONSORSHIP_RX
  );
  console.log(`\n── Sponsorship refusals ──`);
  console.log(`live US postings: ${total}; explicitly refusing sponsorship: ${refusing} (${((refusing / total) * 100).toFixed(1)}%)`);

  const samples = await prisma.$queryRawUnsafe<{ titleRaw: string; descriptionRaw: string }[]>(
    `SELECT "titleRaw", "descriptionRaw" FROM "Job"
     WHERE status = 'LIVE' AND country = 'US' AND "descriptionRaw" ~* $1 LIMIT 6`,
    NO_SPONSORSHIP_RX
  );
  // Print the EXACT matched span with a little context. Sentence-splitting is
  // useless here (these descriptions are HTML soup), and a false positive
  // hides a real job from someone — so precision must be eyeballed directly.
  const rx = new RegExp(NO_SPONSORSHIP_RX.replace(/\\y/g, "\\b"), "i");
  console.log(`\nExact matched spans (checking for false positives):`);
  for (const s of samples) {
    const plain = s.descriptionRaw.replace(/&lt;[^&]*&gt;|<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
    const m = rx.exec(plain);
    const ctx = m ? plain.slice(Math.max(0, m.index - 60), m.index + m[0].length + 40) : "(no match after HTML strip)";
    console.log(`  • ${s.titleRaw.slice(0, 34).padEnd(34)} …${ctx.trim()}…`);
  }

  // The refusal filter must remove EXACTLY the refusing postings from a
  // sponsorship-needing person's feed, and nothing from an authorised one's.
  const authorised = workContext({ country: "PK", authorizedCountries: ["US"], relocateCountries: [] });
  const needsSponsor = workContext({ country: "PK", authorizedCountries: [], relocateCountries: ["US"] });
  const anywhere = workContext({ country: "PK", authorizedCountries: [], relocateCountries: [], relocateAnywhere: true });
  const countFor = async (ctx: ReturnType<typeof workContext>) => {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "Job" j WHERE j.status = 'LIVE' AND j.country = 'US' AND ${eligibilitySql({ targets: 1, regions: 2, sponsorNeeded: 3, rx: 4, anywhere: 5, authorized: 6 })}`,
      ...eligibilityParams(ctx)
    );
    return n;
  };
  const [a, b, c] = [await countFor(authorised), await countFor(needsSponsor), await countFor(anywhere)];
  console.log(`\nUS postings visible — authorised: ${a}, needs sponsorship: ${b}, relocate anywhere: ${c}, hidden by explicit refusal: ${a - b} (expected ${refusing})`);
  console.log(`relocate-anywhere should equal needs-sponsorship for a single country: ${b === c ? "match" : `MISMATCH (${b} vs ${c})`}`);

  // ── 2. Scenarios ──
  const scenarios = [
    { name: "Pakistani, local only (today's default)", country: "PK", authorizedCountries: ["PK"], relocateCountries: [] },
    { name: "US citizen living in Pakistan", country: "PK", authorizedCountries: ["US"], relocateCountries: [] },
    { name: "Pakistani wanting US sponsorship", country: "PK", authorizedCountries: ["PK"], relocateCountries: ["US"] },
    { name: "Dual UK/US national in London", country: "GB", authorizedCountries: ["GB", "US"], relocateCountries: [] },
    { name: "Never answered (falls back to location)", country: "PK", authorizedCountries: [], relocateCountries: [] },
    { name: "Pakistani, relocate ANYWHERE (new toggle)", country: "PK", authorizedCountries: [], relocateCountries: [], relocateAnywhere: true },
    { name: "Pakistani, anywhere but PK-authorised", country: "PK", authorizedCountries: ["PK"], relocateCountries: [], relocateAnywhere: true },
  ];

  console.log(`\n── Eligible live jobs per scenario ──`);
  for (const s of scenarios) {
    const ctx = workContext(s);
    const params = eligibilityParams(ctx);
    const sql = eligibilitySql({ targets: 1, regions: 2, sponsorNeeded: 3, rx: 4, anywhere: 5, authorized: 6 });
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "Job" j WHERE j.status = 'LIVE' AND j.kind = 'JOB' AND ${sql}`,
      ...params
    );
    console.log(`  ${s.name.padEnd(42)} targets=${targetCountries(ctx).join("+") || "(none)"} → ${n} jobs`);
  }

  // ── 3. Labels ──
  console.log(`\n── Honest labels ──`);
  const pkToUs = workContext({ country: "PK", authorizedCountries: ["PK"], relocateCountries: ["US"] });
  const usAbroad = workContext({ country: "PK", authorizedCountries: ["US"], relocateCountries: [] });
  const anywherePk = workContext({ country: "PK", authorizedCountries: ["PK"], relocateCountries: [], relocateAnywhere: true });
  const cases: [string, ReturnType<typeof workContext>, { country: string | null; remoteScope: string | null }][] = [
    ["US onsite job / needs sponsorship", pkToUs, { country: "US", remoteScope: null }],
    ["Remote-US job / US citizen abroad", usAbroad, { country: null, remoteScope: "US" }],
    ["Global remote / US citizen abroad", usAbroad, { country: null, remoteScope: "GLOBAL" }],
    ["Local PK job / Pakistani", workContext({ country: "PK", authorizedCountries: ["PK"], relocateCountries: [] }), { country: "PK", remoteScope: null }],
    ["DE job / Pakistani, relocate anywhere", anywherePk, { country: "DE", remoteScope: null }],
    ["PK job (home, authorised) / relocate anywhere", anywherePk, { country: "PK", remoteScope: null }],
  ];
  for (const [label, ctx, job] of cases) {
    const note = geoNote(job, ctx);
    console.log(`  ${label.padEnd(38)} → ${note ? `[${note.label}] ${note.text}` : "(no caveat)"}`);
  }
}

main().finally(() => prisma.$disconnect());
