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
 * Scope decisions:
 * - ALL currencies: budgets are stored and displayed in the poster's real
 *   currency (salaryCurrency), never FX-converted — the number a user sees
 *   must match the source site. The projects feed offers a "USD only" capsule;
 *   the salary-floor filter skips non-USD budgets (floors are USD).
 * - remoteScope GLOBAL: a public remote project is biddable from anywhere, so
 *   it's eligible in every user's country-scoped feed.
 * - Freelancer.com API T&Cs require cached data refreshed every 24h — re-run
 *   this script at least daily; the expiry pass reaps projects that vanish.
 */

import { prisma } from "@/lib/prisma";
import { crawlFreelancerProjects, type CrawledProject } from "@/lib/ingestion/sources/freelancer";
import { hashDescription } from "@/lib/ingestion/llm-extract";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { classifyProjectVertical } from "@/lib/ingestion/project-classify";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";
import { JobSource, JobStatus, JobKind, RemoteType, EmploymentType, SalaryPeriod, Seniority } from "@prisma/client";

/**
 * Search queries, used for RECALL only.
 *
 * `vertical` here is a FALLBACK, not the answer. The old comment claimed "the
 * query IS the classification"; measured against the live API that is false —
 * "ai video editing" returns 46 projects of which ~5 are video work, and "logo
 * design" shares 16% of its results with "python developer". Each project is
 * now classified by its own skill labels, and this slug is only used when a
 * project carries no label we recognise. See lib/ingestion/project-classify.ts.
 *
 * The video block is deliberately wide. Video and motion work is where demand
 * for AI-assisted production is showing up first, and it arrives as freelance
 * briefs long before it appears as salaried job titles — so recall matters more
 * than tidiness here, and the skill gate absorbs the noise.
 */
const QUERIES: { query: string; vertical: string }[] = [
  { query: "logo design", vertical: "design-creative" },
  { query: "graphic designer", vertical: "design-creative" },
  { query: "ui ux design", vertical: "design-creative" },
  // ── video & motion ──
  { query: "video editing", vertical: "design-creative" },
  { query: "video production", vertical: "design-creative" },
  { query: "motion graphics", vertical: "design-creative" },
  { query: "animation", vertical: "design-creative" },
  { query: "explainer video", vertical: "design-creative" },
  { query: "ugc video", vertical: "design-creative" },
  { query: "youtube video editing", vertical: "design-creative" },
  { query: "ai video", vertical: "design-creative" },
  // ── everything else ──
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

  let created = 0, refreshed = 0, alreadyCurrent = 0, failed = 0;

  let reclassified = 0, fellBack = 0;

  for (const { query, vertical } of QUERIES) {
    if (!verticalBySlug.get(vertical)) { console.warn(`  ! unknown vertical slug ${vertical}, skipping "${query}"`); continue; }
    try {
      const projects = await crawlFreelancerProjects(query, limitPerQuery);
      console.log(`  "${query}": ${projects.length} active`);
      for (const p of projects) {
        try {
          // The project's own skill labels decide the vertical; the query's
          // slug is only a fallback. A loose search returns plenty of things
          // it wasn't asked for — see project-classify.ts.
          const c = classifyProjectVertical(p.skills, vertical);
          if (c.basis === "query-fallback") fellBack++;
          else if (c.vertical !== vertical) reclassified++;
          const verticalId = verticalBySlug.get(c.vertical) ?? verticalBySlug.get(vertical)!;

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

  console.log(`\nDone. Created: ${created}, Refreshed: ${refreshed}, Already current: ${alreadyCurrent}, Failed: ${failed}`);
  // Worth watching: a high fallback count means the skill map has gone stale
  // against Freelancer's taxonomy, and classification is quietly degrading
  // back to trusting the search query.
  console.log(`Vertical from skill labels: ${reclassified} corrected the query's guess, ${fellBack} fell back to it.`);
  if (skipEmbeddings) console.log("Embeddings deferred — run: npx tsx scripts/backfill-embeddings.ts");
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
