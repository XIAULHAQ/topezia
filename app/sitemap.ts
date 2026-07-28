/**
 * sitemap.xml — auto-generated from the taxonomy × live-job counts (spec §7).
 * Only pages that currently clear MIN_JOBS_FOR_PAGE are listed, so the sitemap
 * self-prunes as jobs expire and self-grows as ingestion runs.
 */
import type { MetadataRoute } from "next";
import { listPublishedPages } from "@/lib/seo/pages";
import { jobPath } from "@/lib/seo/job-slug";
import { prisma } from "@/lib/prisma";

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
      select: { slug: true, updatedAt: true },
    });
    portfolioPages = rows.map((r) => ({
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
  // soon-dead URLs would train crawlers to distrust the sitemap. Companies
  // with live roles ride along for the same first-party reason.
  let nativePages: MetadataRoute.Sitemap = [];
  try {
    const [jobs, companies] = await Promise.all([
      prisma.job.findMany({
        where: { source: "NATIVE", status: "LIVE" },
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: { id: true, titleRaw: true, companyName: true, updatedAt: true },
      }),
      prisma.company.findMany({
        where: { jobs: { some: { status: "LIVE" } } },
        take: 1000,
        select: { slug: true, updatedAt: true },
      }),
    ]);
    nativePages = [
      ...jobs.map((j) => ({
        url: `${base}${jobPath(j)}`,
        lastModified: j.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...companies.map((c) => ({
        url: `${base}/company/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    /* leave empty */
  }

  return [...staticRoutes, ...portfolioPages, ...blogPages, ...jobPages, ...nativePages];
}
