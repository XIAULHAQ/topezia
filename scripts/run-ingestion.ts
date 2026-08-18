/**
 * Ingestion orchestrator — spec §4, Slice 2 definition of done:
 * "15k+ live jobs; dupe rate <3% spot-checked; freshness ≤48h"
 *
 * Run: npm run ingest [-- --limit=20] [--max-jobs-per-source=5] [--only=monzo,n26]
 *                       [--sync] [--batch-wait=25]
 *
 * Pulls active Sources from the DB (founding-employer signups are already
 * here via the waitlist form, isPriority=true — see app/api/waitlist/route.ts),
 * crawls each, and pushes every job through: rules -> LLM fallback (cached)
 * -> taxonomy resolution -> dedup -> embed -> save.
 *
 * Priority sources (founding employers) are processed first, so your best
 * relationships show up in the index before anonymous breadth sources do.
 *
 * THREE PHASES, not one loop (strategy §3.4). Phase A crawls every board and
 * runs the rules pass + "have we seen this?" checks; phase B sends every
 * posting that still needs the model through ONE Message Batch (half price;
 * cache and rules-first postings never reach it — see lib/ingestion/
 * llm-extract.ts); phase C writes the jobs. `--sync` restores the old
 * one-call-per-posting path for smoke tests. Nothing about a nightly crawl
 * needs an answer in seconds; the batch usually returns in minutes, and if it
 * runs past --batch-wait the stragglers are done synchronously so a run never
 * ends with a posting un-extracted.
 */

import { prisma } from "@/lib/prisma";
import { crawlGreenhouseBoard } from "@/lib/ingestion/sources/greenhouse";
import { crawlLeverBoard } from "@/lib/ingestion/sources/lever";
import { crawlAshbyBoard } from "@/lib/ingestion/sources/ashby";
import { applyRulesPass } from "@/lib/ingestion/normalize-rules";
import { extractMany, hashDescription, type LlmExtraction } from "@/lib/ingestion/llm-extract";
import { flushLlmUsage } from "@/lib/llm";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";
import { dedupeJob } from "@/lib/ingestion/dedupe";
import { computeAllPageStats } from "@/lib/seo/page-stats";
import { JobSource, JobStatus, Prisma } from "@prisma/client";
import type { CrawledJob } from "@/lib/ingestion/sources/greenhouse";

// Neutral fallback vertical for jobs neither a resolved role nor the LLM's
// classification could place. Deliberately a dedicated "unsorted" bucket, not
// a real category, so unclassifiable jobs don't pollute a live vertical.
const UNSORTED_VERTICAL_SLUG = "unsorted";

async function crawlSource(type: JobSource, companySlug: string): Promise<CrawledJob[]> {
  switch (type) {
    case JobSource.GREENHOUSE:
      return crawlGreenhouseBoard(companySlug);
    case JobSource.LEVER:
      return crawlLeverBoard(companySlug);
    case JobSource.ASHBY:
      return crawlAshbyBoard(companySlug);
    default:
      // WORKABLE, SMARTRECRUITERS, JOBPOSTING_SCHEMA crawlers are Slice 2
      // follow-ups (healthcare vertical, spec §4.1) — not yet implemented.
      console.warn(`No crawler implemented yet for source type ${type}`);
      return [];
  }
}

// "dropbox" -> "Dropbox", "acme-corp" -> "Acme Corp" — a readable last-resort
// display name when no real company name is available.
function titleCaseSlug(slug: string | null): string | null {
  if (!slug) return null;
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type SourceInfo = { type: JobSource; companySlug: string | null; companyName: string | null; careersPageUrl: string | null };

/** A posting that got past the "seen it" checks and is waiting on extraction. */
type PendingJob = {
  key: string;
  job: CrawledJob;
  source: SourceInfo;
  rules: ReturnType<typeof applyRulesPass>;
  descriptionHash: string;
  existing: { id: string } | null;
};

/**
 * Phase A for one posting: rules pass, then the two "have we seen this?"
 * checks that keep unchanged and duplicate postings away from the model.
 */
async function prepareJob(job: CrawledJob, source: SourceInfo, key: string): Promise<{ status: "already-current" } | { status: "pending"; pending: PendingJob }> {
  const rules = applyRulesPass({
    titleRaw: job.titleRaw,
    descriptionRaw: job.descriptionRaw,
    locationRaw: job.locationRaw,
    officeRaw: job.officeRaw,
  });

  const descriptionHash = hashDescription(`${job.titleRaw}\n${rules.descriptionText}`);

  // Have we already got this exact posting? Identity is the source's OWN id —
  // NOT a hash of our normalized text. Hashing made "have we seen this?" a
  // function of our extraction code: when the Greenhouse entity-decoding fix
  // changed how descriptions normalize, every previously-ingested Greenhouse
  // job hashed differently, looked new, and got inserted a second time. A
  // unique index now backs this lookup (migration 010).
  const existing = job.externalId
    ? await prisma.job.findFirst({
        where: { source: source.type, sourceCompanySlug: source.companySlug, externalId: job.externalId },
        select: { id: true, descriptionHash: true },
      })
    : // No stable id from this source — fall back to the click-out URL, which
      // is the next most stable thing we have.
      await prisma.job.findFirst({ where: { sourceUrl: job.sourceUrl }, select: { id: true, descriptionHash: true } });

  // Known posting, unchanged text: just say we saw it. No LLM, no write churn.
  if (existing && existing.descriptionHash === descriptionHash) {
    await prisma.job.update({ where: { id: existing.id }, data: { lastVerifiedAt: new Date() } });
    return { status: "already-current" };
  }

  // Unknown posting, but we've seen byte-identical content from ANY source —
  // the cheapest cross-source dedup, before touching the LLM.
  if (!existing) {
    const existingByHash = await prisma.job.findFirst({ where: { descriptionHash }, select: { id: true } });
    if (existingByHash) {
      await prisma.job.update({ where: { id: existingByHash.id }, data: { lastVerifiedAt: new Date() } });
      return { status: "already-current" };
    }
  }

  return { status: "pending", pending: { key, job, source, rules, descriptionHash, existing: existing ? { id: existing.id } : null } };
}

/** Phase C for one posting: taxonomy resolution, write, embed, dedup. */
async function finishJob(
  { job, source, rules, descriptionHash, existing }: PendingJob,
  llmResult: LlmExtraction,
  opts: { skipEmbeddings?: boolean } = {}
) {
  const roleId = await resolveRole(job.titleRaw, llmResult.roleGuess);
  const skillIds = await resolveSkills(llmResult.skills);

  const role = roleId ? await prisma.role.findUnique({ where: { id: roleId }, select: { verticalId: true, name: true } }) : null;

  // Categorization priority: (1) a resolved taxonomy role is authoritative —
  // roles are hand-mapped to verticals in the seed; (2) else trust the LLM's
  // vertical classification when it names a known slug; (3) else "unsorted".
  let verticalId = role?.verticalId ?? null;
  if (!verticalId && llmResult.vertical) {
    const v = await prisma.vertical.findUnique({
      where: { slug: llmResult.vertical },
      select: { id: true },
    });
    verticalId = v?.id ?? null;
  }
  if (!verticalId) {
    verticalId = (await prisma.vertical.findUnique({ where: { slug: UNSORTED_VERTICAL_SLUG } }))!.id;
  }

  const companyDomain = source.careersPageUrl
    ? new URL(source.careersPageUrl).hostname.replace(/^www\./, "")
    : null;

  // Known posting whose text changed (edited by the employer, or our own
  // normalization changed) -> refresh the row. Creating a second one is what
  // duplicated the feed.
  const data = {
      source: source.type,
      sourceUrl: job.sourceUrl,
      sourceCompanySlug: source.companySlug,
      externalId: job.externalId,
      titleRaw: job.titleRaw,
      titleNormalized: role?.name || llmResult.roleGuess || null,
      roleId,
      verticalId,
      // Priority: real name from the ATS (Greenhouse board metadata) → the
      // Source display override (Ashby/Lever, which don't expose it) →
      // title-cased slug → domain → "Unknown".
      companyName: job.companyName || source.companyName || titleCaseSlug(source.companySlug) || companyDomain || "Unknown",
      companyDomain,
      descriptionRaw: job.descriptionRaw,
      descriptionHash,
      seniority: llmResult.seniority,
      employmentType: rules.employmentType,
      salaryMin: rules.salary.min,
      salaryMax: rules.salary.max,
      salaryPeriod: rules.salary.period || undefined,
      locationRaw: job.locationRaw,
      locationState: rules.locationState,
      country: rules.country,
      remoteScope: rules.remoteScope,
      remoteType: rules.remoteType,
      verticalFields: (llmResult.verticalFields as Prisma.InputJsonValue) || undefined,
      postedAt: job.postedAt,
      status: JobStatus.LIVE,
  };

  let created;
  if (existing) {
    // Replace skills wholesale — the re-extraction is authoritative.
    await prisma.jobSkill.deleteMany({ where: { jobId: existing.id } });
    created = await prisma.job.update({
      where: { id: existing.id },
      data: {
        ...data,
        lastVerifiedAt: new Date(),
        skills: { create: skillIds.map((skillId) => ({ skillId, isRequired: true })) },
      },
    });
  } else {
    created = await prisma.job.create({
      data: { ...data, skills: { create: skillIds.map((skillId) => ({ skillId, isRequired: true })) } },
    });
  }

  // Embed BEFORE dedup, not after: dedup rule (c) compares the new job's
  // embedding against other jobs in the same company (dedupe.ts), and its
  // SQL reads `embedding` for this row. If we embedded after dedup, that
  // column would still be NULL at dedup time and rule (c) could never fire.
  // Embeddings are cheap (spec §4.2), so paying for the occasional job that
  // then turns out to be a duplicate is an acceptable trade for a working
  // near-duplicate check.
  // Embeddings are decoupled from ingestion on purpose. Voyage's free tier is
  // 3 RPM and embed.ts backs off 20-40s on a 429, so leaving them inline makes
  // every worker sit blocked in backoff and concurrency buys nothing. Ship the
  // job LIVE without one and let scripts/backfill-embeddings.ts (throttled and
  // resumable) fill it in — the matcher already falls back to recency.
  if (opts.skipEmbeddings) {
    const dedupSkipped = await dedupeJob({
      id: created.id,
      source: created.source,
      titleRaw: created.titleRaw,
      companyDomain: created.companyDomain,
      locationState: created.locationState,
      descriptionHash: created.descriptionHash,
    });
    if (dedupSkipped.isDuplicate) {
      await prisma.job.update({
        where: { id: created.id },
        data: { status: JobStatus.DUPLICATE, duplicateOfId: dedupSkipped.survivorId },
      });
      return { status: "duplicate" as const };
    }
    return { status: existing ? ("refreshed" as const) : ("created" as const), jobId: created.id };
  }

  const embeddingInput = buildJobEmbeddingInput({
    titleNormalized: created.titleNormalized,
    titleRaw: created.titleRaw,
    skills: llmResult.skills,
    descriptionText: rules.descriptionText,
  });
  const embedding = await embedText(embeddingInput);
  if (embedding) {
    await writeJobEmbedding(prisma, created.id, embedding);
  }
  // embedding === null means no provider is configured yet (see embed.ts) —
  // the job still ships LIVE and gets embedded later by a backfill pass.

  // Dedup against existing LIVE jobs (fuzzy title + embedding rules) —
  // the exact-hash rule was already handled above before the insert.
  const dedupResult = await dedupeJob({
    id: created.id,
    source: created.source,
    titleRaw: created.titleRaw,
    companyDomain: created.companyDomain,
    locationState: created.locationState,
    descriptionHash: created.descriptionHash,
  });

  if (dedupResult.isDuplicate) {
    await prisma.job.update({
      where: { id: created.id },
      data: { status: JobStatus.DUPLICATE, duplicateOfId: dedupResult.survivorId },
    });
    return { status: "duplicate" as const };
  }

  return { status: existing ? ("refreshed" as const) : ("created" as const), jobId: created.id };
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const sourceLimit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  // Safety cap for bounded / smoke-test runs: process at most N jobs per
  // source (the crawler still fetches the whole board in one request, we just
  // don't push every posting through the LLM). Omit for a full production run.
  const maxJobsArg = process.argv.find((a) => a.startsWith("--max-jobs-per-source="));
  const maxJobsPerSource = maxJobsArg ? parseInt(maxJobsArg.split("=")[1], 10) : undefined;

  // Ingest only named boards: `--only=monzo,n26`. Lets a smoke test hit one
  // board instead of pushing all 13 through the LLM.
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1].split(",").map((x) => x.trim()).filter(Boolean) : undefined;

  const sources = await prisma.source.findMany({
    where: { companySlug: only ? { in: only } : { not: null } },
    orderBy: [{ isPriority: "desc" }, { createdAt: "asc" }], // founding employers first
    take: sourceLimit,
  });

  // Jobs are independent, so process several at once. The win is real in
  // production (US runner: ~15ms per DB round-trip, so the per-job cost is the
  // LLM call) and modest locally, where every query pays cross-continent
  // latency.
  const concArg = process.argv.find((a) => a.startsWith("--concurrency="));
  const concurrency = Math.max(1, concArg ? parseInt(concArg.split("=")[1], 10) : 4);
  const skipEmbeddings = process.argv.includes("--skip-embeddings");
  // --sync: one model call per posting, as before. Default is one Message
  // Batch per run (half price) — see the file comment.
  const sync = process.argv.includes("--sync");
  const waitArg = process.argv.find((a) => a.startsWith("--batch-wait="));
  const batchWaitMs = Math.max(1, waitArg ? parseInt(waitArg.split("=")[1], 10) : 25) * 60 * 1000;

  if (concurrency > 1 && !skipEmbeddings && process.env.VOYAGE_API_KEY) {
    console.warn(
      "  ! Voyage free tier is 3 RPM and embed.ts backs off 20-40s on 429 — inline embeddings will serialize this run.\n" +
        "    Prefer --skip-embeddings, then: npx tsx scripts/backfill-embeddings.ts"
    );
  }
  console.log(
    `Ingesting ${sources.length} sources (${sources.filter((s) => s.isPriority).length} priority), ` +
      `concurrency=${concurrency}, embeddings=${skipEmbeddings ? "deferred to backfill" : "inline"}, extraction=${sync ? "sync" : "batch"}...`
  );

  const startedAt = Date.now();
  let processed = 0;
  let created = 0, refreshed = 0, duplicates = 0, alreadyCurrent = 0, failed = 0;

  // ── Phase A: crawl + prepare ─────────────────────────────────────────────
  const perSource: { source: (typeof sources)[number]; pendings: PendingJob[] }[] = [];
  for (const source of sources) {
    if (!source.companySlug) continue;
    try {
      const allJobs = await crawlSource(source.type, source.companySlug);
      const jobs = maxJobsPerSource ? allJobs.slice(0, maxJobsPerSource) : allJobs;
      console.log(
        `  ${source.companySlug} (${source.type}): ${allJobs.length} jobs found` +
          (maxJobsPerSource && allJobs.length > jobs.length ? ` (processing first ${jobs.length})` : "")
      );
      const info: SourceInfo = { type: source.type, companySlug: source.companySlug, companyName: source.companyName, careersPageUrl: source.careersPageUrl };
      const pendings: PendingJob[] = [];

      // Fixed-size worker pool over this board's jobs. Workers pull from a
      // shared cursor, so a slow job never blocks the others.
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor++;
          if (i >= jobs.length) return;
          const job = jobs[i];
          try {
            const r = await prepareJob(job, info, `${source.companySlug}:${i}`);
            if (r.status === "already-current") { alreadyCurrent++; processed++; }
            else pendings.push(r.pending);
          } catch (err) {
            failed++;
            processed++;
            console.error(`    Failed to prepare job "${job.titleRaw}":`, err);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
      perSource.push({ source, pendings });
    } catch (err) {
      console.error(`  Failed to crawl source ${source.companySlug}:`, err);
    }
  }

  // ── Phase B: extraction — cache, rules, then one batch ───────────────────
  const allPending = perSource.flatMap((p) => p.pendings);
  console.log(`\n${allPending.length} postings need extraction (${alreadyCurrent} already current).`);
  const extracted = await extractMany(
    allPending.map((p) => ({ key: p.key, titleRaw: p.job.titleRaw, descriptionText: p.rules.descriptionText })),
    { batch: !sync, concurrency, waitMs: batchWaitMs, log: (m) => console.log(`  ${m}`) }
  );
  const via: Record<string, number> = {};
  for (const r of extracted.values()) via[r.via] = (via[r.via] ?? 0) + 1;
  console.log(`  extraction by path: ${Object.entries(via).map(([k, v]) => `${k}=${v}`).join(" ") || "none"}`);

  // ── Phase C: write ───────────────────────────────────────────────────────
  for (const { source, pendings } of perSource) {
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= pendings.length) return;
        const pending = pendings[i];
        try {
          const ex = extracted.get(pending.key);
          if (!ex) throw new Error("no extraction result");
          const result = await finishJob(pending, ex.extraction, { skipEmbeddings });
          if (result.status === "created") created++;
          else if (result.status === "refreshed") refreshed++;
          else if (result.status === "duplicate") duplicates++;
        } catch (err) {
          failed++;
          console.error(`    Failed to write job "${pending.job.titleRaw}":`, err);
        }
        processed++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, pendings.length) }, worker));

    await prisma.source.update({
      where: { id: source.id },
      data: { lastCrawledAt: new Date() },
    });
  }

  const secs = (Date.now() - startedAt) / 1000;
  const perJob = processed ? Math.round((secs / processed) * 1000) : 0;
  console.log(`\nDone. Created: ${created}, Refreshed: ${refreshed}, Duplicates: ${duplicates}, Already current: ${alreadyCurrent}, Failed: ${failed}`);
  console.log(`${processed} jobs in ${secs.toFixed(1)}s — ${perJob}ms/job wall-clock at concurrency ${concurrency}.`);
  if (skipEmbeddings) {
    const missing = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::int AS n FROM "Job" WHERE status='LIVE' AND embedding IS NULL`
    );
    console.log(`Embeddings deferred: ${missing[0].n} live jobs have none. Run: npx tsx scripts/backfill-embeddings.ts`);
  }

  // Page stats last, because they describe the listings this run just changed
  // (SEO addendum §2.2, market-signals spec §8). Here rather than on its own
  // cron so the numbers can never describe a different crawl than the one that
  // produced them — and never at request time, which is what the addendum
  // explicitly rules out.
  //
  // Non-fatal: a stats failure must not fail the ingestion that already
  // succeeded. Stale stats are recoverable on the next run; a crawl reported as
  // failed is not.
  try {
    console.log("\nComputing page stats…");
    const { written, removed } = await computeAllPageStats((m) => console.log(m));
    console.log(`Page stats: ${written} pages written, ${removed} stale rows removed.`);
  } catch (err) {
    console.error("Page stats failed (ingestion itself succeeded):", err);
  }

  await flushLlmUsage(); // cost rows are fire-and-forget; let them land before the connection goes
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
