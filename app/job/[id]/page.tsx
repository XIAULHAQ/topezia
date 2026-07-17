/**
 * Job detail page — /job/{id}
 *
 * Visitors land HERE first (from the feed, SEO pages and alert emails) instead
 * of being bounced straight to the publisher. "Apply on company site" then goes
 * out through the tracked /go redirect, so we keep the spec's neutrality (§1:
 * the application always happens at the source, never trapped here) while
 * actually showing people the job.
 *
 * Lives at /job/{id} (singular) so it can't collide with the /jobs/* SEO lattice.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { sanitizeJobHtml, renderJobDescription } from "@/lib/sanitize";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export const revalidate = 900;

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

async function getJob(id: string) {
  // A bad uuid would throw in Prisma; treat it as "not found".
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return prisma.job.findUnique({
    where: { id },
    select: {
      id: true, titleRaw: true, titleNormalized: true, companyName: true, descriptionRaw: true,
      locationRaw: true, locationState: true, remoteType: true, employmentType: true, seniority: true,
      salaryMin: true, salaryMax: true, salaryPeriod: true, postedAt: true, lastVerifiedAt: true,
      status: true, source: true, sourceUrl: true,
      vertical: { select: { name: true, slug: true } },
      role: { select: { name: true, slug: true } },
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
}

function salaryText(j: { salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null }) {
  if (j.salaryMin == null || j.salaryMax == null) return null;
  const unit = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "YEAR" ? "/yr" : "";
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  return `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}${unit}`;
}

function freshness(d: Date) {
  const h = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3.6e6));
  if (h < 1) return "verified live just now";
  if (h < 48) return `verified live ${h}h ago`;
  return `verified ${Math.round(h / 24)}d ago`;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getJob(params.id);
  if (!job) return { title: "Job — Topezia" };
  const title = `${job.titleRaw} at ${job.companyName} | Topezia`;
  const description = sanitizeJobHtml(job.descriptionRaw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 155);
  return { title, description, alternates: { canonical: `/job/${job.id}` }, openGraph: { title, description, type: "article" } };
}

export default async function JobDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { score?: string; pos?: string } }) {
  const job = await getJob(params.id);
  if (!job) notFound();

  const dead = job.status === "EXPIRED" || job.status === "SUSPECTED_DEAD";
  const pay = salaryText(job);
  const clean = renderJobDescription(job.descriptionRaw);
  // Carry feed score/position through so the click-out still logs the ranking
  // signal it would have if the feed linked straight to /go.
  const q = new URLSearchParams();
  if (searchParams.score) q.set("score", searchParams.score);
  if (searchParams.pos) q.set("pos", searchParams.pos);
  const applyHref = `/go/${job.id}${q.toString() ? `?${q}` : ""}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.titleRaw,
    description: clean,
    datePosted: (job.postedAt ?? job.lastVerifiedAt).toISOString(),
    employmentType: job.employmentType,
    hiringOrganization: { "@type": "Organization", name: job.companyName },
    jobLocation: job.remoteType.startsWith("REMOTE")
      ? { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "US" } }
      : { "@type": "Place", address: { "@type": "PostalAddress", addressRegion: job.locationState ?? undefined, addressCountry: "US" } },
    ...(job.remoteType.startsWith("REMOTE") ? { jobLocationType: "TELECOMMUTE" } : {}),
    directApply: false,
    url: job.sourceUrl,
  };

  return (
    <main style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header style={S.nav}>
        <Link href="/" style={S.brand}>topezia</Link>
        <Link href="/login" style={S.navLink}>Log in</Link>
      </header>

      <div style={S.wrap}>
        {job.vertical && (
          <Link href={`/jobs/${job.role?.slug ?? job.vertical.slug}`} style={S.crumb}>
            ← All {(job.role?.name ?? job.vertical.name).toLowerCase()} jobs
          </Link>
        )}

        {dead && (
          <div style={S.deadBanner}>
            This role has closed. We keep the posting up for reference, but it&apos;s no longer accepting applicants.
          </div>
        )}

        <h1 style={S.h1}>{job.titleRaw}</h1>
        <div style={S.meta}>
          <strong style={{ color: INK }}>{job.companyName}</strong> · {job.locationRaw || job.locationState || label(job.remoteType)} · {label(job.employmentType)}
          {pay ? ` · ${pay}` : ""}
        </div>
        <div style={S.fresh}>● {freshness(job.lastVerifiedAt)} · via {label(job.source)}</div>

        {!dead && (
          <div style={S.applyRow}>
            <a style={S.applyBtn} href={applyHref} target="_blank" rel="noreferrer">Apply on company site →</a>
            <span style={S.applyNote}>Applies at {job.companyName} — we never sit between you and the employer.</span>
          </div>
        )}

        {job.skills.length > 0 && (
          <div style={S.chips}>
            {job.skills.slice(0, 12).map((s) => (
              <span key={s.skill.name} style={S.chip}>{s.skill.name}</span>
            ))}
          </div>
        )}

        <div style={S.matchCta}>
          <div>
            <div style={S.matchTitle}>Is this actually worth your time?</div>
            <div style={S.matchSub}>Upload your résumé once — get an honest match score, and the skill gaps, for this and every other job.</div>
          </div>
          <Link href="/onboard" style={S.matchBtn}>Show my matches →</Link>
        </div>

        <article style={S.body} dangerouslySetInnerHTML={{ __html: clean }} />

        {!dead && (
          <div style={S.footApply}>
            <a style={S.applyBtn} href={applyHref} target="_blank" rel="noreferrer">Apply on company site →</a>
          </div>
        )}
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 740, margin: "0 auto", padding: "28px 20px 80px" },
  crumb: { color: INDIGO, fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-block", marginBottom: 18 },
  deadBanner: { background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", borderRadius: 12, padding: "12px 16px", fontSize: 14, marginBottom: 18 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 10px", lineHeight: 1.2 },
  meta: { color: MUTED, fontSize: 16, marginBottom: 6 },
  fresh: { color: "#059669", fontSize: 13, fontWeight: 600, marginBottom: 20 },
  applyRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 },
  applyBtn: { display: "inline-block", padding: "13px 24px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: "none" },
  applyNote: { color: MUTED, fontSize: 13 },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 22 },
  chip: { padding: "5px 10px", background: "#eef0ff", color: INDIGO, border: "1px solid #d9dcff", borderRadius: 999, fontSize: 13, fontWeight: 600 },
  matchCta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "#eef0ff", border: "1px solid #d9dcff", borderRadius: 16, padding: 18, marginBottom: 28, flexWrap: "wrap" },
  matchTitle: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 3 },
  matchSub: { color: MUTED, fontSize: 14, lineHeight: 1.45 },
  matchBtn: { padding: "11px 20px", background: INDIGO, color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" },
  body: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 28, fontSize: 15, lineHeight: 1.7, color: "#374151", overflowWrap: "break-word" },
  footApply: { marginTop: 24, textAlign: "center" },
};
