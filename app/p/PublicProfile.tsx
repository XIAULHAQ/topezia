/**
 * Public, SEO-indexed profile (/p/{slug} + /p/{slug}/{tab}) — the shareable,
 * recruiter-facing view of a real profile, ported from the Topezia public
 * design. Server-rendered so the content is crawlable. Only what's backed by
 * real data is shown; unbuilt bits (projects, languages, messaging) are honest
 * "coming soon". No private data (salary) is exposed.
 */
import { cache } from "react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import ShareButton from "./ShareButton";
import { SiteFooter } from "@/app/_components/SiteChrome";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0", bg: "#F1F5F9", navy: "#0F172A", navy2: "#1E1B4B" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "'Sora', system-ui, sans-serif";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com";

const PATHS: Record<string, string[]> = {
  pin: ["M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3 12h18", "M12 3c3 3.5 3 14.5 0 18", "M12 3c-3 3.5-3 14.5 0 18"],
  briefcase: ["M4 8h16v12H4z", "M9 8V5h6v3"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"],
  grad: ["M2 9l10-5 10 5-10 5z", "M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"],
  award: ["M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M8.5 14L7 22l5-3 5 3-1.5-8"],
  gauge: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  zap: ["M13 2L4 14h6l-1 8 9-12h-6z"],
  linkedin: ["M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4V8h4v2", "M2 9h4v12H2z", "M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  github: ["M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.5 3.3 6.6 6.4 7A3.4 3.4 0 0 0 9 18.1V22"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
};
function Ic({ n, s = 16, color }: { n: string; s?: number; color?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>{(PATHS[n] ?? []).map((d, i) => <path key={i} d={d} />)}</svg>;
}
function Brand({ h = 24 }: { h?: number }) {
  return <svg width={(h / 26) * 36} height={h} viewBox="0 0 36 26" aria-hidden><defs><linearGradient id="tzpb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs><circle cx="10.5" cy="13" r="7.2" stroke="url(#tzpb)" strokeWidth="4.2" fill="none" /><circle cx="25.5" cy="13" r="7.2" stroke="url(#tzpb)" strokeWidth="4.2" fill="none" /></svg>;
}

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");
const PROF_PCT: Record<string, number> = { EXPERT: 96, ADVANCED: 86, PROFICIENT: 72, FAMILIAR: 55 };
const initials = (name: string | null) => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export type PublicTab = "overview" | "experience" | "skills" | "projects" | "education";
export const TAB_SLUGS: Exclude<PublicTab, "overview">[] = ["experience", "skills", "projects", "education"];
const TAB_NAV: { key: PublicTab; label: string; href: (s: string) => string }[] = [
  { key: "overview", label: "Overview", href: (s) => `/p/${s}` },
  { key: "experience", label: "Experience", href: (s) => `/p/${s}/experience` },
  { key: "skills", label: "Skills", href: (s) => `/p/${s}/skills` },
  { key: "projects", label: "Projects", href: (s) => `/p/${s}/projects` },
  { key: "education", label: "Education", href: (s) => `/p/${s}/education` },
];

export interface PubProfile {
  slug: string;
  fullName: string | null;
  photoUrl: string | null;
  headline: string | null;
  field: string | null;
  yearsExperience: number | null;
  currentLocation: string | null;
  isRemote: boolean;
  industries: string[];
  skills: { name: string; proficiency: string | null; tier: string }[];
  workHistory: { title?: string; company?: string; years?: string }[];
  education: { degree?: string; institution?: string; year?: string }[];
  certifications: string[];
  employmentTypes: string[];
  remoteTypes: string[];
  locations: string[];
}

/** Fetch a public profile by slug (cached so page + generateMetadata share one query). */
export const getPublicProfile = cache(async (slug: string): Promise<PubProfile | null> => {
  const p = await prisma.profile.findUnique({
    where: { publicSlug: slug },
    select: {
      publicSlug: true, fullName: true, photoUrl: true, headlineRoleId: true, yearsExperience: true,
      currentLocation: true, industries: true, employmentTypes: true, remoteTypes: true, locations: true,
      workHistory: true, education: true, certifications: true,
      skills: { select: { proficiency: true, tier: true, skill: { select: { name: true } } } },
    },
  });
  if (!p || !p.publicSlug) return null;
  const headline = p.headlineRoleId ? (await prisma.role.findUnique({ where: { id: p.headlineRoleId }, select: { name: true } }))?.name ?? null : null;
  return {
    slug: p.publicSlug,
    fullName: p.fullName,
    photoUrl: p.photoUrl,
    headline,
    field: p.industries[0] ? label(p.industries[0]) : null,
    yearsExperience: p.yearsExperience,
    currentLocation: p.currentLocation,
    isRemote: p.remoteTypes.some((r) => r.startsWith("REMOTE")),
    industries: p.industries,
    skills: p.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency, tier: s.tier })),
    workHistory: (p.workHistory as PubProfile["workHistory"]) ?? [],
    education: (p.education as PubProfile["education"]) ?? [],
    certifications: p.certifications,
    employmentTypes: p.employmentTypes,
    remoteTypes: p.remoteTypes,
    locations: p.locations,
  };
});

export function profileMetadata(p: PubProfile, tab: PublicTab): Metadata {
  const name = p.fullName ?? "Topezia member";
  const role = p.headline ?? p.field ?? "professional";
  const tabName = tab === "overview" ? "" : ` · ${label(tab)}`;
  const title = `${name} — ${role}${tabName} | Topezia`;
  const desc = `${name} is ${p.headline ? `a ${p.headline}` : "a professional"}${p.yearsExperience ? ` with ${p.yearsExperience}+ years of experience` : ""}${p.industries.length ? ` in ${p.industries.map(label).join(", ")}` : ""}. See their skills, experience and background on Topezia.`;
  const path = tab === "overview" ? `/p/${p.slug}` : `/p/${p.slug}/${tab}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title, description: desc, url: `${SITE}${path}`, type: "profile", images: p.photoUrl ? [p.photoUrl] : undefined },
    robots: { index: true, follow: true },
  };
}

export default function PublicProfile({ p, tab }: { p: PubProfile; tab: PublicTab }) {
  const name = p.fullName ?? "Topezia member";
  // Core first — "Top skills" is the person's identity, not their side tools.
  const topSkills = [...p.skills]
    .sort((a, b) => {
      const at = a.tier === "SECONDARY" ? 1 : 0, bt = b.tier === "SECONDARY" ? 1 : 0;
      return at !== bt ? at - bt : (PROF_PCT[b.proficiency ?? ""] ?? 65) - (PROF_PCT[a.proficiency ?? ""] ?? 65);
    })
    .slice(0, 6);
  const show = { about: tab === "overview", exp: tab === "overview" || tab === "experience", skills: tab === "skills", projects: tab === "overview" || tab === "projects", edu: tab === "overview" || tab === "education" };
  const url = `${SITE}/p/${p.slug}`;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.bg, fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      <style>{"@media (max-width:820px){.pp-grid{grid-template-columns:1fr!important}.pp-2col{grid-template-columns:1fr!important}.pp-hero{padding:24px 20px!important}}"}</style>
      {/* header */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: C.ink, textDecoration: "none" }}><Brand /><span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span></Link>
          <div style={{ flex: 1 }} />
          <Link href="/login" style={{ fontSize: 13, fontWeight: 600, color: C.slate, padding: "9px 14px", textDecoration: "none" }}>Sign in</Link>
          <Link href="/onboard" style={{ background: GRAD, color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 5px 14px rgba(99,102,241,.3)" }}>Join Topezia</Link>
        </div>
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: 1180, margin: "0 auto", padding: "24px 24px 48px" }}>
        {/* hero */}
        <section className="pp-hero" style={S.hero}>
          <div style={S.heroGlow1} /><div style={S.heroGlow2} />
          <div style={{ position: "relative", display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "none", padding: 5, borderRadius: "50%", background: GRAD }}>
              {p.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.photoUrl} alt={name} style={{ width: 118, height: 118, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block", background: C.navy }} />
                : <div style={{ width: 118, height: 118, borderRadius: "50%", background: C.navy, display: "grid", placeItems: "center", fontSize: 36, fontWeight: 800, color: "#fff" }}>{initials(p.fullName)}</div>}
            </div>
            <div style={{ flex: 1, minWidth: 300, paddingTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.6px" }}>{name}</h1>
                <span style={S.otw}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />Open to opportunities</span>
              </div>
              <div style={{ fontSize: 15.5, color: "#C7CEE4", marginTop: 7, fontWeight: 500 }}>
                {p.headline || "Professional"}{p.field ? <> · <span style={S.fieldGrad}>{p.field}</span></> : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 13, color: "#94A3C0", fontSize: 12.5 }}>
                {p.currentLocation && <span style={S.meta}><Ic n="pin" s={14} />{p.currentLocation}</span>}
                {p.isRemote && <span style={S.meta}><Ic n="globe" s={14} />Open to remote</span>}
                {p.yearsExperience != null && <span style={S.meta}><Ic n="briefcase" s={14} />{p.yearsExperience}+ years experience</span>}
              </div>
              <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
                {["linkedin", "github", "globe", "mail"].map((n) => <span key={n} style={S.social} title="Links — coming soon"><Ic n={n} s={16} /></span>)}
              </div>
            </div>
            <div style={{ flex: "none", paddingTop: 4 }}>
              <ShareButton url={url} />
            </div>
          </div>
        </section>

        {/* tab nav (SEO routes) */}
        <nav style={{ display: "flex", gap: 8, margin: "20px 0", flexWrap: "wrap" }}>
          {TAB_NAV.map((t) => (
            <Link key={t.key} href={t.href(p.slug)} style={t.key === tab ? S.tabOn : S.tabOff}>{t.label}</Link>
          ))}
        </nav>

        <div className="pp-grid" style={S.grid}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            {show.about && (
              <Card><Head icon="user" title="About" />
                {p.headline || p.industries.length
                  ? <p style={S.about}>{p.headline ?? "Professional"}{p.yearsExperience != null ? ` with ${p.yearsExperience}+ years of experience` : ""}{p.industries.length ? ` across ${p.industries.map(label).join(", ")}` : ""}.</p>
                  : <p style={{ ...S.about, color: C.mut }}>This member hasn&apos;t added a summary yet.</p>}
              </Card>
            )}

            {show.exp && (
              <Card><Head icon="briefcase" title="Experience" />
                {p.workHistory.length ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {p.workHistory.map((ex, i) => (
                      <div key={i} style={{ display: "flex", gap: 18, position: "relative", paddingBottom: i < p.workHistory.length - 1 ? 24 : 0 }}>
                        <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 46, height: 46, borderRadius: 12, background: i === 0 ? GRAD : "linear-gradient(135deg,#334155,#0F172A)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{(ex.company ?? "?").slice(0, 2).toUpperCase()}</div>
                          {i < p.workHistory.length - 1 && <div style={{ width: 2, flex: 1, background: "linear-gradient(to bottom,#C7D2FE,transparent)", marginTop: 8 }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{ex.title ?? "Role"}</h3>
                            {i === 0 && <span style={S.currentTag}>Most recent</span>}
                          </div>
                          {ex.company && <div style={{ fontSize: 12.5, color: C.c1, fontWeight: 600, marginTop: 3 }}>{ex.company}</div>}
                          {ex.years && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>{ex.years}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <Empty text="No experience listed yet." />}
              </Card>
            )}

            {show.skills && (
              <Card><Head icon="gauge" title="Core skills" />
                {p.skills.length ? (
                  <>
                    <div className="pp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 28px" }}>
                      {p.skills.filter((s) => s.tier !== "SECONDARY").map((s) => (
                        <div key={s.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, marginBottom: 7 }}><span>{s.name}</span><span style={{ color: C.c1 }}>{s.proficiency ? label(s.proficiency) : "—"}</span></div>
                          <div style={S.barTrack}><div style={{ ...S.barFill, width: `${PROF_PCT[s.proficiency ?? ""] ?? 65}%` }} /></div>
                        </div>
                      ))}
                    </div>
                    {p.skills.some((s) => s.tier === "SECONDARY") && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.mut, margin: "22px 0 12px" }}>Also knows</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {p.skills.filter((s) => s.tier === "SECONDARY").map((s) => (
                            <span key={s.name} style={{ background: "#F1F5F9", border: `1px solid ${C.line}`, color: C.slate, fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: "6px 14px" }}>
                              {s.name}{s.proficiency ? ` · ${label(s.proficiency).toLowerCase()}` : ""}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : <Empty text="No skills listed yet." />}
              </Card>
            )}

            {show.projects && (
              <Card><Head icon="zap" title="Featured projects" soon />
                <p style={{ ...S.about, color: C.mut, margin: 0 }}>Project highlights will appear here. Coming soon.</p>
              </Card>
            )}

            {show.edu && (
              <div className="pp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
                <Card><Head icon="grad" title="Education" />
                  {p.education.length ? p.education.map((e, i) => (
                    <div key={i} style={{ marginBottom: i < p.education.length - 1 ? 12 : 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{e.degree ?? "Degree"}</div>
                      {e.institution && <div style={{ fontSize: 12.5, color: C.c1, fontWeight: 600, marginTop: 3 }}>{e.institution}</div>}
                      {e.year && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>{e.year}</div>}
                    </div>
                  )) : <Empty text="No education listed." />}
                </Card>
                <Card><Head icon="award" title="Certifications" />
                  {p.certifications.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {p.certifications.map((c) => <div key={c} style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: GRAD, flex: "none" }} /><div style={{ fontSize: 12.5, fontWeight: 600 }}>{c}</div></div>)}
                    </div>
                  ) : <Empty text="No certifications listed." />}
                </Card>
              </div>
            )}
          </div>

          {/* right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {topSkills.length > 0 && (
              <Card style={{ padding: "22px 24px" }}>
                <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Top skills</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {topSkills.map((s) => (
                    <div key={s.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}><span>{s.name}</span><span style={{ color: C.c1 }}>{s.proficiency ? label(s.proficiency) : "—"}</span></div>
                      <div style={S.barTrack}><div style={{ ...S.barFill, width: `${PROF_PCT[s.proficiency ?? ""] ?? 65}%` }} /></div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card style={{ padding: "22px 24px" }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Availability</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5, color: C.slate }}>
                <Row k="Work type" v={p.employmentTypes.length ? p.employmentTypes.map(label).join(", ") : "Open"} />
                <Row k="Remote" v={p.isRemote ? "Open to remote" : (p.remoteTypes.length ? p.remoteTypes.map(label).join(", ") : "Flexible")} />
                <Row k="Locations" v={p.locations.length ? p.locations.join(" · ") : (p.currentLocation ?? "Flexible")} />
              </div>
            </Card>

            <Card style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "baseline" }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1 }}>Languages</h2><SoonPill /></div>
              <p style={{ fontSize: 12.5, color: C.mut, margin: "10px 0 0", lineHeight: 1.5 }}>Languages will show here soon.</p>
            </Card>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "24px 26px", ...style }}>{children}</section>;
}
function Head({ icon, title, soon }: { icon: string; title: string; soon?: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}><span style={{ width: 32, height: 32, borderRadius: 9, background: "#EEF2FF", color: C.c1, display: "grid", placeItems: "center" }}><Ic n={icon} /></span><h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</h2>{soon && <SoonPill />}</div>;
}
function SoonPill() {
  return <span style={{ background: "#F1F5F9", color: C.mut, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", border: `1px solid ${C.line}` }}>Coming soon</span>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: C.mut, background: "#F8FAFC", border: `1px dashed ${C.line}`, borderRadius: 10, padding: "14px 16px" }}>{text}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.mut }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span></div>;
}

const S: Record<string, CSSProperties> = {
  hero: { background: C.navy, borderRadius: 20, padding: "30px 32px", position: "relative", overflow: "hidden", color: "#fff" },
  heroGlow1: { position: "absolute", top: -120, right: -60, width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,.34), transparent 68%)" },
  heroGlow2: { position: "absolute", bottom: -140, left: "22%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.22), transparent 68%)" },
  otw: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,.14)", border: "1px solid rgba(34,197,94,.35)", color: "#4ADE80", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 12px" },
  fieldGrad: { background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontWeight: 600 },
  meta: { display: "inline-flex", alignItems: "center", gap: 6 },
  social: { width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", display: "grid", placeItems: "center", color: "#C7CEE4" },
  grid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 22, alignItems: "start" },
  tabOn: { padding: "9px 19px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: GRAD, color: "#fff", border: "1px solid transparent", boxShadow: "0 5px 14px rgba(99,102,241,.3)", textDecoration: "none" },
  tabOff: { padding: "9px 19px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: "#fff", color: C.slate, border: `1px solid ${C.line}`, textDecoration: "none" },
  about: { margin: 0, fontSize: 13.5, lineHeight: 1.75, color: C.slate },
  currentTag: { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: "2px 9px" },
  barTrack: { height: 6, background: "#EEF2FF", borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${C.c1}, ${C.c2})` },
};
