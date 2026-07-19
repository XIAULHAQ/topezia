/**
 * /jobs — the browse hub that anchors the SEO lattice (spec §7).
 *
 * Every link here is a page that currently clears the ≥5-live-jobs floor, so
 * the directory never points at a 404 (the breadcrumb-into-404 lesson). Groups
 * the lattice for humans: by field, by role, and by place.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { getBrowseHub, type HubLink } from "@/lib/seo/pages";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";

// Rendered on-demand, NOT pre-rendered at build: getBrowseHub hits the database,
// and a build-time DB blip (as happened once) would otherwise crash the whole
// deploy. On the runner the queries are fast, and getBrowseHub degrades to an
// empty hub rather than throwing, so this page can never fail a build or 500.
export const dynamic = "force-dynamic";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export async function generateMetadata(): Promise<Metadata> {
  const hub = await getBrowseHub();
  const title = "Browse jobs by field, role, and country | Topezia";
  const description = `${hub.totalLive} verified jobs from company career pages across ${hub.countries.length + 1} countries — matched honestly against your résumé.`;
  return { title, description, alternates: { canonical: "/jobs" }, openGraph: { title, description, url: "/jobs", type: "website" } };
}

function Section({ title, links }: { title: string; links: HubLink[] }) {
  if (links.length === 0) return null;
  return (
    <section style={S.section}>
      <h2 style={S.h2}>{title}</h2>
      <div style={S.grid}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} style={S.chip}>
            {l.label} <span style={S.num}>{l.count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function JobsHubPage() {
  const hub = await getBrowseHub();
  return (
    <main style={S.page}>
      <SiteHeader />

      <div style={S.wrap}>
        <h1 style={S.h1}>Browse jobs</h1>
        <p style={S.intro}>
          {hub.totalLive.toLocaleString()} verified openings, aggregated straight from company
          career pages and re-checked for freshness. Pick a field, role, or place — or{" "}
          <Link href="/onboard" style={S.inlineLink}>upload your résumé</Link> to see which actually fit you.
        </p>

        <Section title="By field" links={hub.verticals} />
        <Section title="By role" links={hub.roles} />
        <Section title="By country" links={hub.countries} />
        <Section title="By US state" links={hub.states} />

        {hub.verticals.length === 0 && hub.roles.length === 0 && (
          <p style={S.empty}>No pages have enough live jobs to publish yet — check back soon.</p>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 34, margin: "0 0 12px" },
  intro: { color: MUTED, fontSize: 17, lineHeight: 1.6, margin: "0 0 36px", maxWidth: 640 },
  inlineLink: { color: INDIGO, fontWeight: 700, textDecoration: "none" },
  section: { marginBottom: 36 },
  h2: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: 0.6, color: MUTED, margin: "0 0 14px" },
  grid: { display: "flex", flexWrap: "wrap", gap: 10 },
  chip: { display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #ececf2", borderRadius: 999, padding: "9px 16px", fontSize: 15, fontWeight: 600, color: INK, textDecoration: "none" },
  num: { color: MUTED, fontSize: 13, fontWeight: 700 },
  empty: { color: MUTED, fontSize: 16 },
};
