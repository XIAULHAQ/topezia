/**
 * /jobs — the browse hub that anchors the SEO lattice (spec §7), on the
 * "Topezia Jobs" design.
 *
 * Every link here is a page that currently clears the ≥5-live-jobs floor, so
 * the directory never points at a 404 (the breadcrumb-into-404 lesson). Groups
 * the lattice for humans: by country, by field, and by role.
 */
import type { Metadata } from "next";
import { getBrowseHub } from "@/lib/seo/pages";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import JobsDirectory from "./_components/JobsDirectory";

// Rendered on-demand, NOT pre-rendered at build: getBrowseHub hits the database,
// and a build-time DB blip (as happened once) would otherwise crash the whole
// deploy. On the runner the queries are fast, and getBrowseHub degrades to an
// empty hub rather than throwing, so this page can never fail a build or 500.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hub = await getBrowseHub();
  const title = "Browse jobs by country, field and role | Topezia";
  const description = `${hub.totalLive.toLocaleString()} verified jobs from company career pages across ${hub.countries.length} markets — each matched honestly against your resume.`;
  return { title, description, alternates: { canonical: "/jobs" }, openGraph: { title, description, url: "/jobs", type: "website" } };
}

export default async function JobsHubPage() {
  const hub = await getBrowseHub();
  return (
    <>
      <SiteHeader />
      <JobsDirectory
        totalLive={hub.totalLive}
        countries={hub.countries}
        verticals={hub.verticals}
        roles={hub.roles}
        popular={hub.popular}
        postedLast7d={hub.postedLast7d}
        medianAgeDays={hub.medianAgeDays}
      />
      <SiteFooter />
    </>
  );
}
