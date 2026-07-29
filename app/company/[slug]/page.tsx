/**
 * /company/{slug} — an employer's public page, in the reference design's
 * shape: gradient cover, dark hero with logo + hiring pill, styled role rows,
 * about card, at-a-glance rail. Only companies that exist ON Topezia get one.
 *
 * Honesty rule: the mock's invented panels (hiring pulse, team, benefits,
 * client stats, verified badge, Follow) are NOT rendered — we show only what
 * the company actually told us plus counts we compute. Those panels can light
 * up later when the data behind them is real.
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
import { companyLogoUrl } from "@/lib/company/storage";

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
      name: true, slug: true, tagline: true, about: true, website: true, location: true, logoPath: true, createdAt: true,
      jobs: {
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, titleRaw: true, kind: true, locationRaw: true, remoteType: true, employmentType: true,
          createdAt: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
        },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getCompany(params.slug);
  if (!c) return { title: "Company — Topezia" };
  const title = `${c.name} — jobs & projects | Topezia`;
  const description = c.tagline ?? `${c.name} is hiring on Topezia.`;
  return { title, description, alternates: { canonical: `/company/${c.slug}` }, openGraph: { title, description } };
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
const TAG_TINTS = [["#EEF2FF", "#4F46E5"], ["#F5F3FF", "#7C3AED"], ["#ECFEFF", "#0E7490"], ["#FFF7ED", "#C2410C"], ["#ECFDF5", "#047857"]];

export default async function CompanyPage({ params }: { params: { slug: string } }) {
  const c = await getCompany(params.slug);
  if (!c) notFound();
  const host = c.website ? new URL(c.website).hostname.replace(/^www\./, "") : null;

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
                  {host && <a href={c.website!} target="_blank" rel="noopener noreferrer" style={{ color: "#A5B4FC", fontWeight: 600 }}>{host} ↗</a>}
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
                <span style={{ background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{c.jobs.length}</span>
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
          </div>

          <aside style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <section style={S.card}>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>At a glance</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {([
                  ["Open roles", String(c.jobs.length)],
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

            <section style={{ border: "1px solid #C7D2FE", background: "linear-gradient(150deg,#EEF2FF,#F5F3FF)", borderRadius: 16, padding: "20px 22px" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Get matched to {c.name}</h3>
              <p style={{ margin: "9px 0 0", fontSize: 12.3, lineHeight: 1.65, color: "#334155" }}>
                Upload your resume once — we score you honestly against these roles and every other live posting in your field.
              </p>
              <Link href="/onboard" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, background: GRAD, color: "#fff", borderRadius: 11, padding: "11px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 8px 20px rgba(99,102,241,.28)" }}>See your matches</Link>
            </section>
          </aside>
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
  roleRow: { border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", display: "flex", gap: 16, alignItems: "center", color: INK, textDecoration: "none" },
};
