/**
 * /company/{slug} — an employer's public page, in the reference design's
 * shape: gradient cover, dark hero with logo + hiring pill, styled role rows,
 * about card, at-a-glance rail. Only companies that exist ON Topezia get one.
 *
 * Honesty rule: the mock's invented panels (hiring pulse, benefits, client
 * stats, verified badge, Follow) are NOT rendered — we show only what the
 * company actually told us plus counts we compute. Those panels can light up
 * later when the data behind them is real. Team IS rendered now, because
 * migration 045 made it real: each of those rows is an account that accepted
 * an invitation sent to an address this company typed.
 *
 * Everything added in 045 — work, clients, testimonials, articles, team — is
 * user-generated, and two consequences run through this file:
 *   - every outbound link the company supplied carries rel="ugc nofollow"
 *     (lib/ugc.ts UGC_REL), including client links and testimonial links;
 *   - whether the page may be indexed at all is now decided by
 *     lib/company/indexing.ts rather than assumed.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { curSym } from "@/lib/currency";
import { jobPath } from "@/lib/seo/job-slug";
import { companyLogoUrl, companyImageUrl } from "@/lib/company/storage";
import { companyIndexable } from "@/lib/company/indexing";
import { UGC_REL } from "@/lib/ugc";
import ReportButton from "@/app/_components/ReportButton";

export const revalidate = 900;

const C1 = "#8B5CF6";
const C2 = "#3B82F6";
const GRAD = `linear-gradient(135deg,${C1},${C2})`;
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";

async function getCompany(slug: string) {
  return prisma.company.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true, slug: true, tagline: true, about: true, website: true, location: true,
      logoPath: true, createdAt: true, spamCleared: true,
      jobs: {
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, titleRaw: true, kind: true, locationRaw: true, remoteType: true, employmentType: true,
          createdAt: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
        },
      },
      work: {
        where: { status: "PUBLISHED" },
        orderBy: [{ position: "asc" }, { publishedAt: "desc" }],
        select: { slug: true, title: true, summary: true, clientName: true, coverPath: true },
      },
      clients: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, websiteUrl: true, logoPath: true },
      },
      testimonials: {
        where: { visible: true },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        select: { id: true, quote: true, authorName: true, authorRole: true, authorCompany: true, authorUrl: true, rating: true, origin: true },
      },
      articles: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 6,
        select: { slug: true, title: true, excerpt: true, publishedAt: true },
      },
      team: {
        where: { visible: true },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: {
          name: true, title: true, role: true,
          profile: { select: { fullName: true, publicSlug: true, publicVisible: true, headlineRoleId: true } },
        },
      },
    },
  });
}

type CompanyRecord = NonNullable<Awaited<ReturnType<typeof getCompany>>>;

/**
 * What each team member does, resolved from their own profile.
 *
 * `Profile.headlineRoleId` has no Prisma relation — it is a bare column, and
 * the /hq members query reaches Role by raw SQL for the same reason — so this
 * is one extra lookup rather than an include. Cheap: a team is a handful of
 * people and the ids collapse to a couple of roles.
 */
async function headlineRoles(team: CompanyRecord["team"]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(team.map((m) => m.profile?.headlineRoleId).filter((x): x is string => !!x)));
  if (!ids.length) return new Map();
  const roles = await prisma.role.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(roles.map((r) => [r.id, r.name]));
}

/** One function decides indexability, so nothing else can quietly disagree. */
function indexable(c: CompanyRecord): boolean {
  return companyIndexable({
    name: c.name,
    tagline: c.tagline,
    about: c.about,
    website: c.website,
    spamCleared: c.spamCleared,
    liveJobCount: c.jobs.length,
    extraText: [
      ...c.testimonials.map((t) => t.quote),
      ...c.testimonials.map((t) => t.authorName),
      ...c.clients.map((cl) => cl.name),
      ...c.work.map((w) => w.title),
      ...c.work.map((w) => w.summary),
    ],
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getCompany(params.slug);
  if (!c) return { title: "Company — Topezia" };
  const title = `${c.name} — jobs & projects | Topezia`;
  const description = c.tagline ?? `${c.name} is hiring on Topezia.`;
  return {
    title,
    description,
    alternates: { canonical: `/company/${c.slug}` },
    openGraph: { title, description },
    // noindex, FOLLOW when it fails: the page works exactly the same for a
    // visitor, it just doesn't put our domain behind thin or suspect content.
    robots: { index: indexable(c), follow: true },
  };
}

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()).replace("Us", "US");
const PERIOD: Record<string, string> = { YEAR: "/yr", HOUR: "/hr", DAY: "/day", PROJECT: " budget" };
function pay(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string | null }): string | null {
  if (j.salaryMin == null && j.salaryMax == null) return null;
  const s = curSym(j.salaryCurrency);
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = j.salaryMin != null && j.salaryMax != null ? `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}` : fmt((j.salaryMin ?? j.salaryMax)!);
  return `${s}${range}${j.salaryPeriod ? PERIOD[j.salaryPeriod] ?? "" : ""}`;
}
const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "1 day ago" : days < 7 ? `${days} days ago` : days < 14 ? "1 week ago" : `${Math.floor(days / 7)} weeks ago`;
};
const initialsOf = (s: string) => s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const TAG_TINTS = [["#EEF2FF", "#4F46E5"], ["#F5F3FF", "#7C3AED"], ["#ECFEFF", "#0E7490"], ["#FFF7ED", "#C2410C"], ["#ECFDF5", "#047857"]];

export default async function CompanyPage({ params }: { params: { slug: string } }) {
  const c = await getCompany(params.slug);
  if (!c) notFound();
  const host = c.website ? new URL(c.website).hostname.replace(/^www\./, "") : null;
  const roleNames = await headlineRoles(c.team);

  return (
    <main style={{ background: "#F1F5F9", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sora), var(--font-jakarta), sans-serif", color: INK }}>
      <SiteNav />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 56px", width: "100%", flex: 1 }}>

        {/* ── Hero: cover band + dark body ── */}
        <section style={{ background: INK, borderRadius: 20, overflow: "hidden", position: "relative", color: "#fff" }}>
          <div style={{ height: 120, position: "relative", overflow: "hidden", background: "linear-gradient(115deg,#4C1D95,#1E3A8A 52%,#0E7490)" }}>
            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,rgba(255,255,255,.06) 0 2px,transparent 2px 26px)" }} />
            <div style={{ position: "absolute", top: -90, right: 60, width: 280, height: 280, borderRadius: "50%", background: "rgba(255,255,255,.1)" }} />
          </div>
          <div style={{ position: "relative", padding: "0 30px 26px" }}>
            <div style={{ display: "flex", gap: 22, alignItems: "flex-end", marginTop: -44, flexWrap: "wrap" }}>
              <div style={{ flex: "none", padding: 4, borderRadius: 22, background: GRAD }}>
                <div style={{ width: 104, height: 104, borderRadius: 18, background: INK, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
                  {companyLogoUrl(c.logoPath) ? (
                    // Real logo: contained on white so a transparent PNG or a
                    // mark with its own background both read correctly.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={companyLogoUrl(c.logoPath)!} alt="" style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", background: "#fff", borderRadius: 18 }} />
                  ) : (
                    <>
                      <div style={{ position: "absolute", inset: 6, borderRadius: 13, background: "linear-gradient(140deg,#7C3AED,#2563EB)" }} />
                      <span style={{ position: "relative", fontSize: 32, fontWeight: 800, letterSpacing: "-1px" }}>{c.name.slice(0, 2).toUpperCase()}</span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 260, paddingBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.6px" }}>{c.name}</h1>
                  {c.jobs.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,.14)", border: "1px solid rgba(34,197,94,.35)", color: "#4ADE80", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 12px" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />Hiring now · {c.jobs.length} {c.jobs.length === 1 ? "role" : "roles"}
                    </span>
                  )}
                </div>
                {c.tagline && <div style={{ fontSize: 14.5, color: "#C7CEE4", marginTop: 8, fontWeight: 500, maxWidth: 620 }}>{c.tagline}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 12, color: "#94A3C0", fontSize: 12.5 }}>
                  {c.location && <span>📍 {c.location}</span>}
                  {host && <a href={c.website!} target="_blank" rel={UGC_REL} style={{ color: "#A5B4FC", fontWeight: 600 }}>{host} ↗</a>}
                  <span>On Topezia since {c.createdAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
                </div>
              </div>
              {c.jobs.length > 0 && (
                <div style={{ flex: "none", paddingBottom: 6 }}>
                  <a href="#roles" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: GRAD, borderRadius: 11, padding: "11px 18px", fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", boxShadow: "0 6px 18px rgba(99,102,241,.35)" }}>See open roles</a>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Two-column body ── */}
        <div style={{ display: "grid", gap: 22, alignItems: "start", marginTop: 22, gridTemplateColumns: "minmax(0,1fr) 320px" }} className="tz-cogrid">
          <style>{"@media (max-width:960px){.tz-cogrid{grid-template-columns:minmax(0,1fr)!important}}"}</style>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>

            <section id="roles" style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={S.cardIcon}>💼</span>
                <h2 style={S.h2}>Open roles</h2>
                <span style={S.count}>{c.jobs.length}</span>
              </div>
              {c.jobs.length === 0 && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Nothing open at the moment.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {c.jobs.map((j, i) => {
                  const [tint, fg] = TAG_TINTS[i % TAG_TINTS.length];
                  const p = pay(j);
                  return (
                    <Link key={j.id} href={jobPath({ id: j.id, titleRaw: j.titleRaw, companyName: c.name })} style={S.roleRow}>
                      <span style={{ flex: "none", width: 42, height: 42, borderRadius: 12, background: tint, color: fg, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, letterSpacing: ".4px" }}>
                        {j.titleRaw.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 14.5, fontWeight: 700, display: "block" }}>{j.titleRaw}</b>
                        <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 5 }}>
                          {j.kind === "PROJECT" ? "Freelance project" : label(j.employmentType)} · {j.locationRaw || label(j.remoteType)}
                        </span>
                      </span>
                      <span style={{ flex: "none", fontSize: 12.5, fontWeight: 700, color: "#334155", textAlign: "right" }}>
                        {p ?? ""}
                        <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: MUTED, marginTop: 3 }}>{ago(j.createdAt)}</span>
                      </span>
                      <span style={{ flex: "none", color: MUTED }}>›</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            {c.about && (
              <section style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={S.cardIcon}>🏢</span>
                  <h2 style={S.h2}>About {c.name}</h2>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: "#334155", whiteSpace: "pre-wrap" }}>{c.about}</p>
              </section>
            )}

            {/* ── Work ──
                id="work" is the destination for "← All work by {company}" on
                a case-study page, so that link lands on the grid rather than
                at the top of a page the reader has already seen. */}
            {c.work.length > 0 && (
              <section id="work" style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={S.cardIcon}>🎨</span>
                  <h2 style={S.h2}>Our work</h2>
                  <span style={S.count}>{c.work.length}</span>
                </div>
                <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                  {c.work.map((w) => (
                    <Link key={w.slug} href={`/company/${c.slug}/work/${w.slug}`} style={S.workCard}>
                      <span style={S.workCover}>
                        {companyImageUrl(w.coverPath) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={companyImageUrl(w.coverPath)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <span style={{ fontSize: 22 }}>🖼️</span>
                        )}
                      </span>
                      <span style={{ display: "block", padding: "12px 14px 14px" }}>
                        <b style={{ fontSize: 13.8, fontWeight: 700, display: "block", lineHeight: 1.4 }}>{w.title}</b>
                        {(w.clientName || w.summary) && (
                          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>
                            {w.clientName && <b style={{ color: "#475569", fontWeight: 600 }}>{w.clientName}</b>}
                            {w.clientName && w.summary ? " — " : ""}
                            {w.summary}
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ── Clients ── */}
            {c.clients.length > 0 && (
              <section style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={S.cardIcon}>🤝</span>
                  <h2 style={S.h2}>Clients</h2>
                </div>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
                  {c.clients.map((cl) => {
                    const logo = companyLogoUrl(cl.logoPath);
                    const inner = (
                      <>
                        <span style={S.clientMark}>
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#94A3B8" }}>{cl.name.slice(0, 3).toUpperCase()}</span>
                          )}
                        </span>
                        {/* The name always renders, never replaced by the logo:
                            an image-only link is unreadable to a screen reader
                            and is the exact shape of a link farm. */}
                        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 8, textAlign: "center" }}>{cl.name}</span>
                      </>
                    );
                    return cl.websiteUrl ? (
                      <a key={cl.id} href={cl.websiteUrl} target="_blank" rel={UGC_REL} style={S.clientCell}>{inner}</a>
                    ) : (
                      <div key={cl.id} style={S.clientCell}>{inner}</div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Testimonials ──
                No Review or AggregateRating JSON-LD anywhere near these. They
                are unverified copy a company typed about itself; marking them
                up as reviews would launder that through a vocabulary that
                means something stricter. The label says where they came from. */}
            {c.testimonials.length > 0 && (
              <section style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={S.cardIcon}>💬</span>
                  <h2 style={S.h2}>What clients say</h2>
                </div>
                {/* The note describes the DEFAULT case; anything a client
                    actually wrote carries its own badge below. Saying "provided
                    by the company" over a quote the client wrote would be as
                    wrong as the reverse. */}
                <p style={{ margin: "0 0 16px", fontSize: 11.5, color: "#94A3B8" }}>
                  {c.testimonials.every((t) => t.origin === "INVITED")
                    ? "Written by clients through an invitation. Topezia hasn't verified who they are."
                    : `Provided by ${c.name} unless marked otherwise. Topezia hasn't verified these.`}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {c.testimonials.map((t) => (
                    <figure key={t.id} style={S.quote}>
                      {t.rating != null && (
                        <div style={{ color: "#F59E0B", fontSize: 13, letterSpacing: 1.5, marginBottom: 7 }} aria-label={`${t.rating} out of 5`}>
                          {"★".repeat(t.rating)}<span style={{ color: "#E2E8F0" }}>{"★".repeat(5 - t.rating)}</span>
                        </div>
                      )}
                      <blockquote style={{ margin: 0, fontSize: 13.8, lineHeight: 1.75, color: "#334155" }}>&ldquo;{t.quote}&rdquo;</blockquote>
                      <figcaption style={{ fontSize: 12.3, color: MUTED, marginTop: 10 }}>
                        <b style={{ color: INK }}>{t.authorName}</b>
                        {t.origin === "INVITED" && (
                          // Precisely what the invitation proves, and no more:
                          // they received the email and wrote this themselves.
                          // Not identity — so the badge never says "verified".
                          <span style={S.invitedBadge} title="Written by the client through an invitation from this company. Topezia hasn't verified their identity.">
                            written by the client
                          </span>
                        )}
                        {[t.authorRole, t.authorCompany].filter(Boolean).length > 0 && ` — ${[t.authorRole, t.authorCompany].filter(Boolean).join(", ")}`}
                        {t.authorUrl && (
                          <> · <a href={t.authorUrl} target="_blank" rel={UGC_REL} style={{ color: "#4F46E5", fontWeight: 600 }}>site ↗</a></>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* ── Articles ── */}
            {c.articles.length > 0 && (
              <section style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={S.cardIcon}>✍️</span>
                  <h2 style={S.h2}>Writing</h2>
                  <Link href={`/company/${c.slug}/articles`} style={{ marginLeft: "auto", fontSize: 12.5, color: "#4F46E5", fontWeight: 700, textDecoration: "none" }}>All articles →</Link>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {c.articles.map((a) => (
                    <Link key={a.slug} href={`/company/${c.slug}/articles/${a.slug}`} style={S.articleRow}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 14, fontWeight: 700, display: "block" }}>{a.title}</b>
                        {a.excerpt && <span style={{ display: "block", fontSize: 12.3, color: MUTED, marginTop: 5, lineHeight: 1.55 }}>{a.excerpt}</span>}
                      </span>
                      {a.publishedAt && (
                        <span style={{ flex: "none", fontSize: 11.5, color: MUTED, whiteSpace: "nowrap" }}>
                          {a.publishedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <section style={S.card}>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>At a glance</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {([
                  ["Open roles", String(c.jobs.length)],
                  c.work.length ? ["Work shown", String(c.work.length)] : null,
                  c.location ? ["Location", c.location] : null,
                  host ? ["Website", host] : null,
                  ["On Topezia", `Since ${c.createdAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`],
                ].filter(Boolean) as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span style={{ flex: "none", width: 88, fontSize: 11.5, color: MUTED, fontWeight: 600 }}>{k}</span>
                    <span style={{ flex: 1, fontSize: 12.8, fontWeight: 600, color: "#334155", minWidth: 0 }}>{v}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Team ── real rows: each accepted an invitation sent to an
                address this company typed, and signed in with it. */}
            {c.team.length > 0 && (
              <section style={S.card}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Team</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {c.team.map((m, i) => {
                    const name = m.profile?.fullName?.trim() || m.name;
                    const href = m.profile?.publicVisible && m.profile.publicSlug ? `/p/${m.profile.publicSlug}` : null;
                    // What someone DOES, in order of how well it's known: the
                    // title the company gave them here, then the role on their
                    // own profile. "Owner"/"Team" is the last resort — it
                    // describes their relationship to this page, which is the
                    // least interesting thing about them to a visitor.
                    const role =
                      m.title?.trim() ||
                      (m.profile?.headlineRoleId ? roleNames.get(m.profile.headlineRoleId) : null) ||
                      (m.role === "OWNER" ? "Owner" : "Team");
                    const body = (
                      <>
                        <span style={S.teamAvatar}>{initialsOf(name)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ fontSize: 13, fontWeight: 700, display: "block" }}>{name}</b>
                          <span style={{ display: "block", fontSize: 11.5, color: MUTED, marginTop: 2 }}>{role}</span>
                        </span>
                      </>
                    );
                    return href ? (
                      <Link key={i} href={href} style={S.teamRow}>{body}</Link>
                    ) : (
                      <div key={i} style={S.teamRow}>{body}</div>
                    );
                  })}
                </div>
              </section>
            )}

            <section style={{ border: "1px solid #C7D2FE", background: "linear-gradient(150deg,#EEF2FF,#F5F3FF)", borderRadius: 16, padding: "20px 22px" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Get matched to {c.name}</h3>
              <p style={{ margin: "9px 0 0", fontSize: 12.3, lineHeight: 1.65, color: "#334155" }}>
                Upload your resume once — we score you honestly against these roles and every other live posting in your field.
              </p>
              <Link href="/onboard" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, background: GRAD, color: "#fff", borderRadius: 11, padding: "11px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 8px 20px rgba(99,102,241,.28)" }}>See your matches</Link>
            </section>
          </aside>
        </div>

        {/* Quiet, and at the bottom. Same placement and same reasoning as the
            profile and portfolio pages — see ReportButton. */}
        <div style={{ marginTop: 26 }}>
          <ReportButton kind="COMPANY" targetId={c.id} />
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "24px 26px" },
  cardIcon: { width: 32, height: 32, borderRadius: 9, background: "#EEF2FF", display: "grid", placeItems: "center", fontSize: 15 },
  h2: { margin: 0, fontSize: 16, fontWeight: 700 },
  count: { background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 },
  roleRow: { border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", display: "flex", gap: 16, alignItems: "center", color: INK, textDecoration: "none" },
  workCard: { display: "block", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden", color: INK, textDecoration: "none", background: "#fff" },
  workCover: { display: "grid", placeItems: "center", height: 148, background: "#F1F5F9", overflow: "hidden" },
  clientCell: { display: "flex", flexDirection: "column", alignItems: "center", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 10px", textDecoration: "none" },
  clientMark: { display: "grid", placeItems: "center", width: "100%", height: 44, padding: "0 6px" },
  quote: { margin: 0, border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", background: "#FCFCFD" },
  invitedBadge: { display: "inline-block", marginLeft: 8, background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0", borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 700 },
  articleRow: { border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start", color: INK, textDecoration: "none" },
  teamRow: { display: "flex", gap: 11, alignItems: "center", color: INK, textDecoration: "none" },
  teamAvatar: { flex: "none", width: 34, height: 34, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 800 },
};
