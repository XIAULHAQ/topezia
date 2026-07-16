/**
 * Ingestion orchestrator — spec §4, Slice 2 definition of done:
 * "15k+ live jobs; dupe rate <3% spot-checked; freshness ≤48h"
 *
 * Run: npm run ingest [-- --limit=20]
 *
 * Pulls active Sources from the DB (founding-employer signups are already
 * here via the waitlist form, isPriority=true — see app/api/waitlist/route.ts),
 * crawls each, and pushes every job through: rules -> LLM fallback (cached)
 * -> taxonomy resolution -> dedup -> embed -> save.
 *
 * Priority sources (founding employers) are processed first, so your best
 * relationships show up in the index before anonymous breadth sources do.
 */

import { prisma } from "@/lib/prisma";
import { crawlGreenhouseBoard } from "@/lib/ingestion/sources/greenhouse";
import { crawlLeverBoard } from "@/lib/ingestion/sources/lever";
import { crawlAshbyBoard } from "@/lib/ingestion/sources/ashby";
import { applyRulesPass } from "@/lib/ingestion/normalize-rules";
import { extractWithLlm, hashDescription } from "@/lib/ingestion/llm-extract";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";
import { dedupeJob } from "@/lib/ingestion/dedupe";
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

async function processJob(
  job: CrawledJob,
  source: { type: JobSource; companySlug: string | null; careersPageUrl: string | null }
) {
  const rules = applyRulesPass({
    titleRaw: job.titleRaw,
    descriptionRaw: job.descriptionRaw,
    locationRaw: job.locationRaw,
  });

  const descriptionHash = hashDescription(`${job.titleRaw}\n${rules.descriptionText}`);

  // Skip re-processing entirely if we've already ingested byte-identical
  // content from ANY source — the cheapest possible dedup check, before
  // even touching the LLM or writing a new row.
  const existingByHash = await prisma.job.findFirst({
    where: { descriptionHash },
    select: { id: true },
  });
  if (existingByHash) {
    await prisma.job.update({
      where: { id: existingByHash.id },
      data: { lastVerifiedAt: new Date() },
    });
    return { status: "already-current" as const };
  }

  // Rung 2: LLM fills what rules couldn't (skills, seniority, role guess,
  // vertical-specific fields). Cached internally by description hash.
  const llmResult = await extractWithLlm(job.titleRaw, rules.descriptionText);

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

  const created = await prisma.job.create({
    data: {
      source: source.type,
      sourceUrl: job.sourceUrl,
      sourceCompanySlug: source.companySlug,
      externalId: job.externalId,
      titleRaw: job.titleRaw,
      titleNormalized: role?.name || llmResult.roleGuess || null,
      roleId,
      verticalId,
      companyName: companyDomain || source.companySlug || "Unknown", // TODO: extract real company name (Slice 2 follow-up — most ATS responses include it, worth wiring up)
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
      remoteType: rules.remoteType,
      verticalFields: (llmResult.verticalFields as Prisma.InputJsonValue) || undefined,
      postedAt: job.postedAt,
      status: JobStatus.LIVE,
      skills: {
        create: skillIds.map((skillId) => ({ skillId, isRequired: true })),
      },
    },
  });

  // Embed BEFORE dedup, not after: dedup rule (c) compares the new job's
  // embedding against other jobs in the same company (dedupe.ts), and its
  // SQL reads `embedding` for this row. If we embedded after dedup, that
  // column would still be NULL at dedup time and rule (c) could never fire.
  // Embeddings are cheap (spec §4.2), so paying for the occasional job that
  // then turns out to be a duplicate is an acceptable trade for a working
  // near-duplicate check.
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

  return { status: "created" as const, jobId: created.id };
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const sourceLimit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  // Safety cap for bounded / smoke-test runs: process at most N jobs per
  // source (the crawler still fetches the whole board in one request, we just
  // don't push every posting through the LLM). Omit for a full production run.
  const maxJobsArg = process.argv.find((a) => a.startsWith("--max-jobs-per-source="));
  const maxJobsPerSource = maxJobsArg ? parseInt(maxJobsArg.split("=")[1], 10) : undefined;

  const sources = await prisma.source.findMany({
    where: { companySlug: { not: null } },
    orderBy: [{ isPriority: "desc" }, { createdAt: "asc" }], // founding employers first
    take: sourceLimit,
  });

  console.log(`Ingesting ${sources.length} sources (${sources.filter((s) => s.isPriority).length} priority)...`);

  let created = 0, duplicates = 0, alreadyCurrent = 0, failed = 0;

  for (const source of sources) {
    if (!source.companySlug) continue;
    try {
      const allJobs = await crawlSource(source.type, source.companySlug);
      const jobs = maxJobsPerSource ? allJobs.slice(0, maxJobsPerSource) : allJobs;
      console.log(
        `  ${source.companySlug} (${source.type}): ${allJobs.length} jobs found` +
          (maxJobsPerSource && allJobs.length > jobs.length ? ` (processing first ${jobs.length})` : "")
      );

      for (const job of jobs) {
        try {
          const result = await processJob(job, {
            type: source.type,
            companySlug: source.companySlug,
            careersPageUrl: source.careersPageUrl,
          });
          if (result.status === "created") created++;
          else if (result.status === "duplicate") duplicates++;
          else alreadyCurrent++;
        } catch (err) {
          failed++;
          console.error(`    Failed to process job "${job.titleRaw}":`, err);
        }
      }

      await prisma.source.update({
        where: { id: source.id },
        data: { lastCrawledAt: new Date() },
      });
    } catch (err) {
      console.error(`  Failed to crawl source ${source.companySlug}:`, err);
    }
  }

  console.log(`\nDone. Created: ${created}, Duplicates: ${duplicates}, Already current: ${alreadyCurrent}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
