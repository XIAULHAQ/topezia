/**
 * sitemap.xml — auto-generated from the taxonomy × live-job counts (spec §7).
 * Only pages that currently clear MIN_JOBS_FOR_PAGE are listed, so the sitemap
 * self-prunes as jobs expire and self-grows as ingestion runs.
 */
import type { MetadataRoute } from "next";
import { listPublishedPages } from "@/lib/seo/pages";
import { jobPath } from "@/lib/seo/job-slug";
import { prisma } from "@/lib/prisma";
import { portfolioIndexable, INDEXABLE_WORK_SELECT } from "@/lib/portfolio/indexing";
import { companyIndexable, companyWorkIndexable, companyArticleIndexable } from "@/lib/company/indexing";
import { htmlToText } from "@/lib/company/article";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
  const now = new Date();

  // Only indexable content here — must not contradict robots.ts, or Search
  // Console flags "Submitted URL blocked by robots.txt". /onboard, /feed and
  // /login are transactional surfaces and are disallowed there, so they're out.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/portfolio`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/waitlist`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // The site chat is a product someone can buy today, so it belongs here
    // at a weight to match — unlike the waitlist pages above it.
    { url: `${base}/site-chat`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/pricing/business`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Published portfolios are real content pages with a named author — the
  // strongest indexable asset here, and the whole reason they're public.
  // Degrades to nothing rather than failing the sitemap if the DB is unhappy.
  let portfolioPages: MetadataRoute.Sitemap = [];
  try {
    const rows = await prisma.portfolio.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 5000,
      select: { slug: true, updatedAt: true, ...INDEXABLE_WORK_SELECT },
    });
    portfolioPages = rows
      // Same function the page's generateMetadata uses. Advertising a URL here
      // that then serves `noindex` is a contradiction Search Console reports
      // back as an error, so the two decisions come from one place.
      .filter(portfolioIndexable)
      .map((r) => ({
        url: `${base}/portfolio/${r.slug}`,
        lastModified: r.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
  } catch {
    /* leave empty */
  }

  // Published blog posts, plus a page per tag that actually has a post — same
  // degrade-to-empty-on-DB-hiccup pattern as everything else here.
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const rows = await prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 5000,
      select: { slug: true, updatedAt: true, tags: true },
    });
    blogPages = rows.map((r) => ({
      url: `${base}/blog/${r.slug}`,
      lastModified: r.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
    const tags = Array.from(new Set(rows.flatMap((r) => r.tags)));
    blogPages.push(
      ...tags.map((t) => ({
        url: `${base}/blog/tag/${encodeURIComponent(t)}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }))
    );
  } catch {
    /* leave empty */
  }

  let jobPages: MetadataRoute.Sitemap = [];
  try {
    const paths = await listPublishedPages();
    jobPages = paths.map((p) => ({
      url: `${base}${p}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch {
    // Never let a DB hiccup break sitemap.xml — ship the static routes at least.
  }

  // NATIVE postings only: first-party pages with real URL lifespans and an
  // in-app apply. Crawled jobs stay out — they expire within days and their
  // canonical content lives on the source's own site; listing thousands of
  // soon-dead URLs would train crawlers to distrust the sitemap.
  let nativePages: MetadataRoute.Sitemap = [];
  try {
    const jobs = await prisma.job.findMany({
      where: { source: "NATIVE", status: "LIVE" },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { id: true, titleRaw: true, companyName: true, updatedAt: true },
    });
    nativePages = jobs.map((j) => ({
      url: `${base}${jobPath(j)}`,
      lastModified: j.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));
  } catch {
    /* leave empty */
  }

  // Company pages, their work and their articles.
  //
  // Every URL here runs through the SAME functions the pages themselves use to
  // decide `robots.index` (lib/company/indexing.ts). A sitemap that advertises
  // a URL the page then refuses to be indexed is a contradiction Search
  // Console reports back as an error — so the two are decided once, not twice.
  let companyPages: MetadataRoute.Sitemap = [];
  try {
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { jobs: { some: { status: "LIVE" } } },
          { work: { some: { status: "PUBLISHED" } } },
          { articles: { some: { status: "PUBLISHED" } } },
        ],
      },
      take: 1000,
      select: {
        slug: true, updatedAt: true, name: true, tagline: true, about: true, website: true, spamCleared: true,
        _count: { select: { jobs: { where: { status: "LIVE" } } } },
        testimonials: { where: { visible: true }, select: { quote: true, authorName: true } },
        clients: { select: { name: true } },
        work: {
          where: { status: "PUBLISHED" },
          select: {
            slug: true, title: true, summary: true, description: true, clientName: true, tags: true, updatedAt: true,
            media: { select: { caption: true } },
          },
        },
        articles: {
          where: { status: "PUBLISHED" },
          select: { slug: true, title: true, excerpt: true, contentHtml: true, tags: true, updatedAt: true },
        },
      },
    });

    for (const c of companies) {
      const parentOk = companyIndexable({
        name: c.name,
        tagline: c.tagline,
        about: c.about,
        website: c.website,
        spamCleared: c.spamCleared,
        liveJobCount: c._count.jobs,
        extraText: [
          ...c.testimonials.map((t) => t.quote),
          ...c.testimonials.map((t) => t.authorName),
          ...c.clients.map((cl) => cl.name),
          ...c.work.map((w) => w.title),
          ...c.work.map((w) => w.summary),
        ],
      });
      // A sub-page of a company page we decline to index doesn't belong in the
      // sitemap either — the pages themselves apply the same rule.
      if (!parentOk) continue;

      companyPages.push({
        url: `${base}/company/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "daily",
        priority: 0.6,
      });

      for (const w of c.work) {
        if (!companyWorkIndexable({ ...w, captions: w.media.map((m) => m.caption) }, c.spamCleared)) continue;
        companyPages.push({
          url: `${base}/company/${c.slug}/work/${w.slug}`,
          lastModified: w.updatedAt,
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }

      for (const a of c.articles) {
        if (!companyArticleIndexable({ title: a.title, excerpt: a.excerpt, bodyText: htmlToText(a.contentHtml), tags: a.tags }, c.spamCleared)) continue;
        companyPages.push({
          url: `${base}/company/${c.slug}/articles/${a.slug}`,
          lastModified: a.updatedAt,
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }
    }
  } catch {
    /* leave empty */
  }

  return [...staticRoutes, ...portfolioPages, ...blogPages, ...jobPages, ...nativePages, ...companyPages];
}
