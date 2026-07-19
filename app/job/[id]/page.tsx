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
import { MIN_JOBS_FOR_PAGE } from "@/lib/seo/pages";
import SiteNav from "@/app/_components/SiteNav";
import { curSym } from "@/lib/currency";

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
      id: true, kind: true, titleRaw: true, titleNormalized: true, companyName: true, descriptionRaw: true,
      locationRaw: true, locationState: true, country: true, remoteType: true, employmentType: true, seniority: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, postedAt: true, lastVerifiedAt: true,
      status: true, source: true, sourceUrl: true, roleId: true, verticalId: true,
      vertical: { select: { name: true, slug: true } },
      role: { select: { name: true, slug: true } },
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
}

function salaryText(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string | null }) {
  if (j.salaryMin == null || j.salaryMax == null) return null;
  const sym = curSym(j.salaryCurrency); // poster's real currency, never converted
  const unit = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "YEAR" ? "/yr" : j.salaryPeriod === "PROJECT" ? " budget" : "";
  const fmt = (n: number) => (n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`);
  return `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}${unit}`;
}

function freshness(d: Date) {
  const h = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3.6e6));
  if (h < 1) return "verified live just now";
  if (h < 48) return `verified live ${h}h ago`;
  return `verified ${Math.round(h / 24)}d ago`;
}

/**
 * The breadcrumb must not point at a page the >=5-live-jobs rule hides, or we
 * link straight into a 404 (every job in a thin role did exactly that). Walk up
 * to the closest parent that actually publishes: role → vertical → nothing.
 */
async function parentLink(job: {
  roleId: string | null;
  verticalId: string;
  role: { name: string; slug: string } | null;
  vertical: { name: string; slug: string };
}): Promise<{ href: string; label: string } | null> {
  if (job.role && job.roleId) {
    const n = await prisma.job.count({ where: { status: "LIVE", roleId: job.roleId } });
    if (n >= MIN_JOBS_FOR_PAGE) return { href: `/jobs/${job.role.slug}`, label: `All ${job.role.name.toLowerCase()} jobs` };
  }
  if (job.vertical.slug !== "unsorted") {
    const n = await prisma.job.count({ where: { status: "LIVE", verticalId: job.verticalId } });
    if (n >= MIN_JOBS_FOR_PAGE) return { href: `/jobs/${job.vertical.slug}`, label: `All ${job.vertical.name.toLowerCase()} jobs` };
  }
  return null;
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

  const parent = await parentLink(job);
  const dead = job.status === "EXPIRED" || job.status === "SUSPECTED_DEAD";
  const pay = salaryText(job);
  const clean = renderJobDescription(job.descriptionRaw);
  // Carry feed score/position through so the click-out still logs the ranking
  // signal it would have if the feed linked straight to /go.
  const q = new URLSearchParams();
  if (searchParams.score) q.set("score", searchParams.score);
  if (searchParams.pos) q.set("pos", searchParams.pos);
  const applyHref = `/go/${job.id}${q.toString() ? `?${q}` : ""}`;
  const isProject = job.kind === "PROJECT";
  const applyLabel = isProject ? "Bid on Freelancer.com →" : "Apply on company site →";
  const sourceLabel = job.source === "FREELANCER_COM" ? "Freelancer.com" : label(job.source);

  // Google's JobPosting policy covers employment, not freelance bid work —
  // emitting it for projects would risk the whole site's rich-result standing.
  const jsonLd = isProject ? null : {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.titleRaw,
    description: clean,
    datePosted: (job.postedAt ?? job.lastVerifiedAt).toISOString(),
    employmentType: job.employmentType,
    hiringOrganization: { "@type": "Organization", name: job.companyName },
    // Use the job's real country, and omit it when unknown — hardcoding "US"
    // told Google every UK/German posting was American.
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(job.remoteType.startsWith("REMOTE") ? {} : { addressRegion: job.locationState ?? undefined }),
        ...(job.country ? { addressCountry: job.country } : {}),
      },
    },
    ...(job.remoteType.startsWith("REMOTE") ? { jobLocationType: "TELECOMMUTE" } : {}),
    directApply: false,
    url: job.sourceUrl,
  };

  return (
    <main style={S.page}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

      <SiteNav />

      <div style={S.wrap}>
        {parent && (
          <Link href={parent.href} style={S.crumb}>← {parent.label}</Link>
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
        <div style={S.fresh}>● {freshness(job.lastVerifiedAt)} · via {sourceLabel}</div>

        {!dead && (
          <div style={S.applyRow}>
            <a style={S.applyBtn} href={applyHref} target="_blank" rel="noreferrer">{applyLabel}</a>
            <span style={S.applyNote}>{isProject ? "Bidding happens on Freelancer.com — we never sit between you and the client." : `Applies at ${job.companyName} — we never sit between you and the employer.`}</span>
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
            <a style={S.applyBtn} href={applyHref} target="_blank" rel="noreferrer">{applyLabel}</a>
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
