/**
 * Freelance-project ingestion — Freelancer.com click-out aggregation.
 *
 * Run: npx tsx scripts/run-project-ingestion.ts [--limit-per-query=25] [--skip-embeddings]
 *
 * Distinct from run-ingestion.ts on purpose: projects skip the LLM rung
 * entirely. The source API hands us its own skill labels (which we resolve
 * against our taxonomy), seniority doesn't apply to a bid marketplace, and the
 * vertical comes deterministically from the search query that found the
 * project. Cheaper, faster, and nothing is invented.
 *
 * v1 scope decisions:
 * - USD-budget projects only, so budget filtering/display stays honest without
 *   currency conversion. Revisit when projects get their own budget UI.
 * - remoteScope GLOBAL: a public remote project is biddable from anywhere, so
 *   it's eligible in every user's country-scoped feed.
 * - Freelancer.com API T&Cs require cached data refreshed every 24h — re-run
 *   this script at least daily; the expiry pass reaps projects that vanish.
 */

import { prisma } from "@/lib/prisma";
import { crawlFreelancerProjects, type CrawledProject } from "@/lib/ingestion/sources/freelancer";
import { hashDescription } from "@/lib/ingestion/llm-extract";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";
import { JobSource, JobStatus, JobKind, RemoteType, EmploymentType, SalaryPeriod, Seniority } from "@prisma/client";

// Search query -> our vertical slug. The query IS the classification: a
// project found by "logo design" is a design project. Queries are chosen for
// verticals where freelance project work actually exists.
const QUERIES: { query: string; vertical: string }[] = [
  { query: "logo design", vertical: "design-creative" },
  { query: "graphic designer", vertical: "design-creative" },
  { query: "ui ux design", vertical: "design-creative" },
  { query: "video editing", vertical: "design-creative" },
  { query: "website development", vertical: "tech-software" },
  { query: "mobile app development", vertical: "tech-software" },
  { query: "python developer", vertical: "tech-software" },
  { query: "data analysis", vertical: "tech-software" },
  { query: "seo", vertical: "marketing" },
  { query: "social media marketing", vertical: "marketing" },
  { query: "content writing", vertical: "marketing" },
  { query: "bookkeeping", vertical: "finance-accounting" },
  { query: "accounting", vertical: "finance-accounting" },
  { query: "virtual assistant", vertical: "operations-hr" },
  { query: "customer support", vertical: "customer-support" },
];

const SOURCE_SLUG = "freelancer"; // stable sourceCompanySlug for the unique lookup

async function processProject(p: CrawledProject, verticalId: string, skipEmbeddings: boolean) {
  const descriptionHash = hashDescription(`${p.titleRaw}\n${p.descriptionRaw}`);

  const existing = await prisma.job.findFirst({
    where: { source: JobSource.FREELANCER_COM, sourceCompanySlug: SOURCE_SLUG, externalId: p.externalId },
    select: { id: true, descriptionHash: true },
  });

  if (existing && existing.descriptionHash === descriptionHash) {
    await prisma.job.update({ where: { id: existing.id }, data: { lastVerifiedAt: new Date() } });
    return "already-current" as const;
  }

  // Cross-source byte-identical guard (spam reposts are common on marketplaces).
  if (!existing) {
    const byHash = await prisma.job.findFirst({ where: { descriptionHash }, select: { id: true } });
    if (byHash) {
      await prisma.job.update({ where: { id: byHash.id }, data: { lastVerifiedAt: new Date() } });
      return "already-current" as const;
    }
  }

  // The source's own skill labels resolve straight against our taxonomy — no
  // LLM. Unresolvable labels drop out (resolveSkills already de-duplicates).
  const skillIds = await resolveSkills(p.skills);
  const roleId = await resolveRole(p.titleRaw, null); // usually null — project titles aren't job titles

  const data = {
    kind: JobKind.PROJECT,
    source: JobSource.FREELANCER_COM,
    sourceUrl: p.sourceUrl,
    sourceCompanySlug: SOURCE_SLUG,
    externalId: p.externalId,
    titleRaw: p.titleRaw,
    titleNormalized: null,
    roleId,
    verticalId,
    companyName: "Client on Freelancer.com", // projects are posted by anonymous-ish clients
    companyDomain: null, // deliberately null: skips company-scoped fuzzy dedup
    descriptionRaw: p.descriptionRaw,
    descriptionHash,
    seniority: Seniority.NOT_APPLICABLE,
    employmentType: EmploymentType.CONTRACT,
    salaryMin: p.budgetMin != null ? Math.round(p.budgetMin) : null,
    salaryMax: p.budgetMax != null ? Math.round(p.budgetMax) : null,
    salaryCurrency: p.currency,
    salaryPeriod: p.isHourly ? SalaryPeriod.HOUR : SalaryPeriod.PROJECT,
    locationRaw: "Remote (bid from anywhere)",
    remoteType: RemoteType.REMOTE_GLOBAL,
    remoteScope: "GLOBAL",
    country: null,
    postedAt: p.postedAt,
    status: JobStatus.LIVE,
  };

  let saved;
  if (existing) {
    await prisma.jobSkill.deleteMany({ where: { jobId: existing.id } });
    saved = await prisma.job.update({
      where: { id: existing.id },
      data: { ...data, lastVerifiedAt: new Date(), skills: { create: skillIds.map((skillId) => ({ skillId, isRequired: true })) } },
    });
  } else {
    saved = await prisma.job.create({
      data: { ...data, skills: { create: skillIds.map((skillId) => ({ skillId, isRequired: true })) } },
    });
  }

  if (!skipEmbeddings) {
    const embedding = await embedText(
      buildJobEmbeddingInput({
        titleNormalized: null,
        titleRaw: p.titleRaw,
        skills: p.skills,
        descriptionText: p.descriptionRaw,
      })
    );
    if (embedding) await writeJobEmbedding(prisma, saved.id, embedding);
  }

  return existing ? ("refreshed" as const) : ("created" as const);
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit-per-query="));
  const limitPerQuery = limitArg ? parseInt(limitArg.split("=")[1], 10) : 25;
  const skipEmbeddings = process.argv.includes("--skip-embeddings");

  const verticals = await prisma.vertical.findMany({ select: { id: true, slug: true } });
  const verticalBySlug = new Map(verticals.map((v) => [v.slug, v.id]));

  let created = 0, refreshed = 0, alreadyCurrent = 0, skippedNonUsd = 0, failed = 0;

  for (const { query, vertical } of QUERIES) {
    const verticalId = verticalBySlug.get(vertical);
    if (!verticalId) { console.warn(`  ! unknown vertical slug ${vertical}, skipping "${query}"`); continue; }
    try {
      const projects = await crawlFreelancerProjects(query, limitPerQuery);
      const usd = projects.filter((p) => p.currency === "USD");
      skippedNonUsd += projects.length - usd.length;
      console.log(`  "${query}": ${projects.length} active, ${usd.length} USD`);
      for (const p of usd) {
        try {
          const r = await processProject(p, verticalId, skipEmbeddings);
          if (r === "created") created++;
          else if (r === "refreshed") refreshed++;
          else alreadyCurrent++;
        } catch (err) {
          failed++;
          console.error(`    failed "${p.titleRaw}":`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error(`  crawl failed for "${query}":`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. Created: ${created}, Refreshed: ${refreshed}, Already current: ${alreadyCurrent}, Non-USD skipped: ${skippedNonUsd}, Failed: ${failed}`);
  if (skipEmbeddings) console.log("Embeddings deferred — run: npx tsx scripts/backfill-embeddings.ts");
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
