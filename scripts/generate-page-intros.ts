/**
 * Generate/refresh the LLM intro copy for every publishable SEO page (spec §7:
 * "LLM-written once per page, cached, regenerated monthly").
 *
 * Run: npx tsx scripts/generate-page-intros.ts [--dry-run] [--force] [--limit=N]
 *
 * Runs out of band (cron), never on the render path — a page with no cached
 * intro just shows the templated one, so this failing degrades copy quality and
 * nothing else. Only writes copy for pages that currently clear the >=5 floor,
 * so we never pay to write prose for a page nobody can reach.
 */

import { prisma } from "@/lib/prisma";
import { listPublishedPages, resolveSeoPage } from "@/lib/seo/pages";
import { generateIntro, saveIntro, INTRO_MAX_AGE_DAYS } from "@/lib/seo/intro";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "/jobs/account-executive/ca" → ["account-executive", "ca"] */
function parsePath(path: string): { slug: string; state?: string } | null {
  const parts = path.replace(/^\/jobs\//, "").split("/");
  if (parts.length === 1) return { slug: parts[0] };
  if (parts.length === 2) return { slug: parts[0], state: parts[1] };
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — refusing to run without --dry-run.");
    process.exit(1);
  }

  let paths = await listPublishedPages();
  if (limit) paths = paths.slice(0, limit);
  console.log(`${paths.length} publishable page(s)${dryRun ? " — DRY RUN" : ""}\n`);

  const staleBefore = new Date(Date.now() - INTRO_MAX_AGE_DAYS * 86400_000);
  let written = 0, skippedFresh = 0, failed = 0;

  for (const path of paths) {
    const existing = await prisma.seoPageIntro.findUnique({
      where: { pageKey: path },
      select: { generatedAt: true },
    });
    if (existing && !force && existing.generatedAt > staleBefore) {
      skippedFresh++;
      continue;
    }

    const parsed = parsePath(path);
    if (!parsed) continue;
    const page = await resolveSeoPage(parsed.slug, parsed.state);
    if (!page) continue; // dropped below the floor since listing — skip

    try {
      const intro = await generateIntro({
        pageKey: page.canonicalPath,
        heading: page.heading,
        jobCount: page.total,
        sampleTitles: page.jobs.slice(0, 6).map((j) => j.titleRaw),
        sampleCompanies: page.jobs.slice(0, 6).map((j) => j.companyName),
      });

      if (dryRun) {
        console.log(`  WOULD WRITE ${path} (${page.total} jobs)\n    ${intro}\n`);
      } else {
        await saveIntro(page.canonicalPath, intro, page.total);
        console.log(`  ✓ ${path} (${page.total} jobs)\n    ${intro}\n`);
      }
      written++;
      await sleep(500); // be polite to the API
    } catch (err) {
      failed++;
      console.error(`  ✗ ${path}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. ${dryRun ? "Would write" : "Written"}: ${written}, still fresh: ${skippedFresh}, failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
