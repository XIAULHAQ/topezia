/**
 * sitemap.xml — auto-generated from the taxonomy × live-job counts (spec §7).
 * Only pages that currently clear MIN_JOBS_FOR_PAGE are listed, so the sitemap
 * self-prunes as jobs expire and self-grows as ingestion runs.
 */
import type { MetadataRoute } from "next";
import { listPublishedPages } from "@/lib/seo/pages";

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
    { url: `${base}/waitlist`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

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

  return [...staticRoutes, ...jobPages];
}
