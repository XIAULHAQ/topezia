/**
 * Set up (or re-crawl) the site chat widget for a company, from the CLI.
 *
 * Run: npx tsx scripts/setup-widget.ts <company-slug> <domain>
 *      npx tsx scripts/setup-widget.ts rodeo-graphics rodeo.graphics
 *
 * Same code path as POST /api/company/widget, minus the owner session — for
 * onboarding a pilot company by hand or re-crawling from a terminal. Prints
 * the embed snippet at the end.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeDomain, crawlSite } from "@/lib/widget/crawl";

async function main() {
  const [slug, domainArg] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: npx tsx scripts/setup-widget.ts <company-slug> [domain]");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!company) {
    console.error(`No company with slug "${slug}".`);
    process.exit(1);
  }

  const existing = await prisma.widgetSite.findUnique({ where: { companyId: company.id } });
  const norm = normalizeDomain(domainArg ?? existing?.domain);
  if (!norm.ok) {
    console.error(norm.error);
    process.exit(1);
  }

  const site = existing
    ? await prisma.widgetSite.update({ where: { id: existing.id }, data: { domain: norm.host } })
    : await prisma.widgetSite.create({
        data: { companyId: company.id, domain: norm.host, siteToken: randomBytes(16).toString("base64url") },
      });

  console.log(`Crawling ${norm.host} for ${company.name}…`);
  const result = await crawlSite(site.id, norm.host);
  console.log(`Pages: ${result.pages}, chunks: ${result.chunks}, products: ${result.products}${result.error ? `, error: ${result.error}` : ""}`);

  const embedded = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM "SiteChunk" WHERE "siteId" = $1 AND embedding IS NOT NULL`,
    site.id
  );
  console.log(`Embedded chunks: ${embedded[0].n}`);
  console.log(`\nEmbed snippet:\n<script src="https://www.topezia.com/widget.js" data-topezia="${site.siteToken}" async></script>`);
}

main().finally(() => prisma.$disconnect());
