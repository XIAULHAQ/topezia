/**
 * Backfill Job.country / Job.remoteScope and correct remoteType, by re-parsing
 * locationRaw with the rules in normalize-rules.ts.
 *
 * Needed because the old model had no country and only REMOTE_US/REMOTE_GLOBAL,
 * so every remote job with an unstated-or-non-US scope was stamped REMOTE_US —
 * "Remote - Poland" was shown to US seekers as a US-eligible job.
 *
 * Pure re-parse of stored text: no LLM, no network, safe to re-run.
 * Dry-run by default; pass --apply.
 */
import { prisma } from "@/lib/prisma";
import { extractCountry, extractRemoteScope, extractRemoteType, extractLocationState, stripHtml } from "@/lib/ingestion/normalize-rules";

async function main() {
  const apply = process.argv.includes("--apply");
  const jobs = await prisma.job.findMany({
    select: { id: true, titleRaw: true, locationRaw: true, locationState: true, country: true, remoteScope: true, remoteType: true, descriptionRaw: true },
  });

  let changed = 0;
  let unlied = 0;
  for (const j of jobs) {
    const text = stripHtml(j.descriptionRaw);
    const next = {
      country: extractCountry(j.locationRaw),
      remoteScope: extractRemoteScope(j.locationRaw, text),
      remoteType: extractRemoteType(j.locationRaw, text),
      locationState: extractLocationState(j.locationRaw),
    };
    const diff =
      next.country !== j.country || next.remoteScope !== j.remoteScope ||
      next.remoteType !== j.remoteType || next.locationState !== j.locationState;
    if (!diff) continue;

    // The specific harm being undone: claimed US-eligible, isn't.
    const wasLie = j.remoteType === "REMOTE_US" && next.remoteType === "REMOTE_INTL";
    if (wasLie) unlied++;
    console.log(
      `${wasLie ? "🚩" : "  "} ${(j.locationRaw ?? "(none)").padEnd(42)} ${j.remoteType} → ${next.remoteType.padEnd(13)} country=${next.country ?? "-"} scope=${next.remoteScope ?? "-"}`
    );
    if (apply) await prisma.job.update({ where: { id: j.id }, data: next });
    changed++;
  }

  console.log(`\n${jobs.length} jobs, ${changed} updated${apply ? "" : " (dry run — pass --apply)"}`);
  console.log(`🚩 ${unlied} were claiming REMOTE_US while being non-US only`);
  const byCountry = await prisma.job.groupBy({ by: ["country"], where: { status: "LIVE" }, _count: true });
  if (apply) console.log("live jobs by country:", byCountry.map((c) => `${c.country ?? "unknown"}=${c._count}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
