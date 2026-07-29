/**
 * Job detail page — /job/{id}, in the reference design's shape: dark hero,
 * per-viewer AI match card, skills, about-the-company, and a sticky apply
 * rail with at-a-glance facts and similar roles.
 *
 * Visitors land HERE first (from the feed, SEO pages and alert emails) instead
 * of being bounced straight to the publisher. "Apply on company site" then goes
 * out through the tracked /go redirect, so we keep the spec's neutrality (§1:
 * the application always happens at the source, never trapped here) while
 * actually showing people the job. NATIVE postings apply in-app instead.
 *
 * The page is ONE cached document for everyone (revalidate 900, SEO) — all
 * per-viewer material (match card, apply gating) is client-fetched. Honesty:
 * the mock's invented bits (per-dimension match bars, "ACTIVELY HIRING",
 * fabricated applicant counts) are not rendered; applicant counts appear only
 * on native postings where we actually count them.
 *
 * Lives at /job/{id} (singular) so it can't collide with the /jobs/* SEO lattice.
 */
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { renderJobDescription, jobDescriptionText } from "@/lib/sanitize";
import { MIN_JOBS_FOR_PAGE } from "@/lib/seo/pages";
import { jobPath, extractJobId } from "@/lib/seo/job-slug";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { jobPostingLd } from "@/lib/seo/job-posting-ld";
import SiteNav from "@/app/_components/SiteNav";
import ApplyGate from "./ApplyGate";
import ApplyBox from "./ApplyBox";
import TailorButton from "./TailorButton";
import ApplicationReadiness from "./ApplicationReadiness";
import MatchCard from "./MatchCard";
import ViewPing from "./ViewPing";
import RelocationCard from "./RelocationCard";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { curSym } from "@/lib/currency";

const INDIGO = "#4f46e5";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";

export const revalidate = 900;

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

async function getJob(param: string) {
  // Accepts the slugged form (…-{uuid}), a bare uuid, or garbage (not found).
  const id = extractJobId(param);
  if (!id) return null;
  return prisma.job.findUnique({
    where: { id },
    select: {
      id: true, kind: true, titleRaw: true, titleNormalized: true, companyName: true, descriptionRaw: true,
      locationRaw: true, locationState: true, country: true, remoteType: true, remoteScope: true, employmentType: true, seniority: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, postedAt: true, lastVerifiedAt: true,
      status: true, source: true, sourceUrl: true, roleId: true, verticalId: true,
      vertical: { select: { name: true, slug: true } },
      role: { select: { name: true, slug: true } },
      skills: { select: { skill: { select: { name: true } } } },
      company: { select: { name: true, slug: true, tagline: true, about: true, location: true } },
      _count: { select: { applications: true } },
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

/** Same role first, then same vertical — real live postings, no invented "match %". */
async function similarRoles(job: { id: string; roleId: string | null; verticalId: string }) {
  const where = job.roleId
    ? { status: "LIVE" as const, roleId: job.roleId, id: { not: job.id } }
    : { status: "LIVE" as const, verticalId: job.verticalId, id: { not: job.id } };
  return prisma.job.findMany({
    where,
    orderBy: { lastVerifiedAt: "desc" },
    take: 3,
    select: { id: true, titleRaw: true, companyName: true, locationRaw: true, remoteType: true },
  });
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getJob(params.id);
  if (!job) return { title: "Job — Topezia" };
  const title = `${job.titleRaw} at ${job.companyName} | Topezia`;
  const description = jobDescriptionText(job.descriptionRaw);
  return { title, description, alternates: { canonical: jobPath(job) }, openGraph: { title, description, type: "article" } };
}

export default async function JobDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { score?: string; pos?: string } }) {
  const job = await getJob(params.id);
  if (!job) notFound();

  // One canonical URL per job: bare-uuid links and stale slugs 301 here.
  const canonical = jobPath(job);
  if (`/job/${decodeURIComponent(params.id)}` !== canonical) {
    const qs = new URLSearchParams(searchParams as Record<string, string>).toString();
    permanentRedirect(qs ? `${canonical}?${qs}` : canonical);
  }

  const [parent, similar] = await Promise.all([parentLink(job), similarRoles(job)]);
  const dead = job.status === "EXPIRED" || job.status === "SUSPECTED_DEAD";
  const pay = salaryText(job);
  const clean = renderJobDescription(job.descriptionRaw);
  const q = new URLSearchParams();
  if (searchParams.score) q.set("score", searchParams.score);
  if (searchParams.pos) q.set("pos", searchParams.pos);
  const applyHref = `/go/${job.id}${q.toString() ? `?${q}` : ""}`;
  const isProject = job.kind === "PROJECT";
  const isNative = job.source === "NATIVE";
  const applyLabel = isProject ? "Bid on Freelancer.com →" : "Apply on company site →";
  const applyNote = isProject
    ? "Bidding happens on Freelancer.com — we never sit between you and the client."
    : `Applies at ${job.companyName} — we never sit between you and the employer.`;
  const sourceLabel = job.source === "FREELANCER_COM" ? "Freelancer.com" : isNative ? "posted on Topezia" : label(job.source);
  const applicants = isNative ? job._count.applications : null;

  // Google's JobPosting policy covers employment, not freelance bid work —
  // emitting it for projects would risk the whole site's rich-result standing.
  // See lib/seo/job-posting-ld.ts for which fields we emit and, more
  // importantly, which Search Console asks for that we deliberately omit
  // because we don't hold the data.
  const jsonLd = isProject
    ? null
    : jobPostingLd({
        titleRaw: job.titleRaw,
        descriptionClean: clean,
        postedAt: job.postedAt,
        lastVerifiedAt: job.lastVerifiedAt,
        employmentType: job.employmentType,
        companyName: job.companyName,
        locationRaw: job.locationRaw,
        locationState: job.locationState,
        country: job.country,
        remoteType: job.remoteType,
        remoteScope: job.remoteScope,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        sourceUrl: job.sourceUrl,
        isNative,
      });

  const applyBlock = dead ? null : isNative
    ? <ApplyBox jobId={job.id} kind={job.kind} companyName={job.companyName} />
    : <ApplyGate jobId={job.id} applyHref={applyHref} applyLabel={applyLabel} note={applyNote} />;

  return (
    <main style={S.page}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />}
      {/* Counts one view for the employer's dashboard. Only on live postings:
          a dead listing's numbers shouldn't keep moving. */}
      {!dead && <ViewPing jobId={job.id} />}
      <SiteNav />

      <div style={S.wrap}>
        {parent && <Link href={parent.href} style={S.crumb}>← {parent.label}</Link>}

        {dead && (
          <div style={S.deadBanner}>
            This role has closed. We keep the posting up for reference, but it&apos;s no longer accepting applicants.
          </div>
        )}

        <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* ── Main column ── */}
          <div style={{ flex: "1 1 480px", minWidth: 0 }}>

            {/* Dark hero */}
            <section style={S.hero}>
              <div style={S.heroGlow} />
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={S.logo}>{job.companyName.slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <h1 style={S.h1}>{job.titleRaw}</h1>
                      {!dead && <span style={S.livePill}>● {freshness(job.lastVerifiedAt)}</span>}
                    </div>
                    <div style={{ fontSize: 14, color: "#C7CEE4", fontWeight: 600, marginTop: 6 }}>
                      {job.company
                        ? <Link href={`/company/${job.company.slug}`} style={{ color: "#C7CEE4" }}>{job.companyName} ↗</Link>
                        : job.companyName}
                      {" · "}via {sourceLabel}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: "#9AA3BD" }}>
                      <span>📍 {job.locationRaw || job.locationState || label(job.remoteType)}</span>
                      <span>{isProject ? "Freelance project" : label(job.employmentType)}</span>
                      {pay && <span style={{ color: "#4ADE80", fontWeight: 600 }}>{pay}</span>}
                      {job.seniority !== "NOT_APPLICABLE" && <span>{label(job.seniority)} level</span>}
                    </div>
                  </div>
                </div>
                {applicants !== null && (
                  <div style={{ fontSize: 11.5, color: "#9AA3BD", marginTop: 16 }}>
                    {applicants === 0 ? "No applicants yet — be the first." : `${applicants} ${isProject ? (applicants === 1 ? "proposal" : "proposals") : (applicants === 1 ? "applicant" : "applicants")} so far`}
                  </div>
                )}
              </div>
            </section>

            {/* Per-viewer AI match — client-fetched, cache-first */}
            <MatchCard jobId={job.id} />

            {/* Only renders when this match actually crosses a border for the viewer */}
            <RelocationCard jobId={job.id} />

            <section style={S.card}>
              <h2 style={S.h2}>About the {isProject ? "project" : "role"}</h2>
              <article style={S.body} dangerouslySetInnerHTML={{ __html: clean }} />
            </section>

            {job.skills.length > 0 && (
              <section style={S.card}>
                <h2 style={S.h2}>Skills for this {isProject ? "project" : "role"}</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  {job.skills.slice(0, 14).map((s) => (
                    <span key={s.skill.name} style={S.skillChip}>{s.skill.name}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 12 }}>Your match card above shows which of these you have and which are gaps.</div>
              </section>
            )}

            {job.company && (job.company.about || job.company.tagline) && (
              <section style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                  <div style={{ ...S.logo, width: 48, height: 48, fontSize: 19, borderRadius: 12 }}>{job.company.name.slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ ...S.h2, margin: 0 }}>{job.company.name}</h2>
                    {(job.company.tagline || job.company.location) && (
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{[job.company.tagline, job.company.location].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <Link href={`/company/${job.company.slug}`} style={S.ghostBtn}>View company</Link>
                </div>
                {job.company.about && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#334155", whiteSpace: "pre-wrap" }}>{job.company.about}</p>}
              </section>
            )}

            {/* Stable target for the tailor panel's "Apply on Topezia" —
                see ApplyBox.tsx's topezia:apply-open listener. Only this
                instance gets the id; ApplyBox also renders in the rail
                below, and an id must not repeat in the DOM. */}
            <div id="job-apply-box">{applyBlock}</div>
          </div>

          {/* ── Rail ── */}
          <div style={S.rail}>
            <section style={{ ...S.card, margin: 0, position: "sticky", top: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>
                {isProject ? "Send a proposal" : "Your application"}
              </div>
              {!dead && <ApplicationReadiness jobId={job.id} />}
              {applyBlock ?? <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0" }}>This posting has closed.</p>}
              {!dead && (
                <div style={{ marginTop: 12 }}>
                  <TailorButton
                    jobId={job.id}
                    companyName={job.companyName}
                    jobTitle={job.titleNormalized ?? job.titleRaw}
                    jobSkills={job.skills.map((s) => s.skill.name)}
                    applyHref={applyHref}
                    applyLabel={applyLabel}
                    isNative={isNative}
                  />
                </div>
              )}
            </section>

            <section style={{ ...S.card, margin: 0 }}>
              <h2 style={{ ...S.h2, fontSize: 15 }}>At a glance</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, fontSize: 12.5, marginTop: 12 }}>
                {([
                  ["Type", isProject ? "Freelance project" : label(job.employmentType)],
                  ["Work model", label(job.remoteType)],
                  job.seniority !== "NOT_APPLICABLE" ? ["Experience", label(job.seniority)] : null,
                  pay ? [isProject ? "Budget" : "Salary", pay] : null,
                  job.role ? ["Category", job.role.name] : job.vertical.slug !== "unsorted" ? ["Category", job.vertical.name] : null,
                  job.postedAt ? ["Posted", job.postedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })] : null,
                  ["Source", sourceLabel],
                ].filter(Boolean) as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: MUTED }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </section>

            {similar.length > 0 && (
              <section style={{ ...S.card, margin: 0 }}>
                <h2 style={{ ...S.h2, fontSize: 15 }}>Similar roles</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12 }}>
                  {similar.map((sm) => (
                    <Link key={sm.id} href={jobPath(sm)} style={S.similarRow}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, flex: "none" }}>
                        {sm.companyName.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sm.titleRaw}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sm.companyName} · {sm.locationRaw || label(sm.remoteType)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F1F5F9", fontFamily: "var(--font-sora), var(--font-jakarta), sans-serif", color: INK },
  wrap: { maxWidth: 1080, margin: "0 auto", padding: "24px 24px 56px" },
  crumb: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 16, textDecoration: "none" },
  deadBanner: { background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 12, padding: "13px 16px", fontSize: 13, marginBottom: 16, lineHeight: 1.5 },
  hero: { background: INK, borderRadius: 18, padding: "26px 30px", color: "#fff", position: "relative", overflow: "hidden" },
  heroGlow: { position: "absolute", top: -110, right: -50, width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.36), transparent 68%)" },
  logo: { width: 60, height: 60, borderRadius: 15, background: GRAD, display: "grid", placeItems: "center", fontSize: 24, fontWeight: 800, flex: "none", color: "#fff" },
  h1: { margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-0.5px" },
  livePill: { background: "rgba(34,197,94,.14)", border: "1px solid rgba(34,197,94,.35)", color: "#4ADE80", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 11px", whiteSpace: "nowrap" },
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 26px", margin: "18px 0" },
  h2: { margin: 0, fontSize: 16, fontWeight: 700 },
  body: { fontSize: 13.5, lineHeight: 1.75, color: "#334155", marginTop: 10, overflowWrap: "break-word" },
  skillChip: { border: `1px solid ${LINE}`, background: "#F8FAFC", color: "#334155", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600 },
  rail: { flex: "1 1 280px", maxWidth: 320, display: "flex", flexDirection: "column", gap: 18 },
  ghostBtn: { fontSize: 12.5, fontWeight: 600, border: `1px solid ${LINE}`, borderRadius: 9, padding: "8px 16px", color: "#334155", textDecoration: "none", flex: "none" },
  similarRow: { display: "flex", alignItems: "center", gap: 12, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 13px", color: INK, textDecoration: "none" },
};
