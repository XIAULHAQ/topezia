/**
 * /about — the "Topezia About" design.
 *
 * Honesty adaptations from the mock, same rule the login panel already follows:
 * its stat band claimed "48k+ live openings matched daily" and "120k+
 * professionals found their next role on Topezia". Neither is true — the live
 * corpus is a fraction of the first, and the second describes outcomes we have
 * not had yet. Both are replaced with figures counted from the database at
 * request time, so this page can never drift into a claim we cannot support.
 * If the corpus is small, the number shown is small.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getBrowseHub } from "@/lib/seo/pages";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";

// Counted at request time, and getBrowseHub degrades to an empty hub rather
// than throwing — a DB blip must not fail the build or 500 the page.
export const dynamic = "force-dynamic";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

const TITLE = "About Topezia — the job search we wished existed";
const DESCRIPTION =
  "Topezia replaces the endless scroll with an honest answer: where you stand in your field, and the roadmap to the role you want. Built by digital creators.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/about", type: "website" },
};

const ICON: Record<string, string[]> = {
  spark: ["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  upload: ["M4 16v4h16v-4", "M12 4v11", "M8 8l4-4 4 4"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  briefcase: ["M4 8h16v12H4z", "M9 8V5h6v3"],
  layers: ["M12 3l9 5-9 5-9-5 9-5z", "M3 12l9 5 9-5", "M3 16l9 5 9-5"],
  gauge: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  heart: ["M12 21C5 15 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 12 19 15 12 21z"],
  film: ["M4 4h16v16H4z", "M4 9h16", "M4 15h16", "M9 4v16", "M15 4v16"],
  mega: ["M3 11v2l12 5V6L3 11z", "M15 8a3 3 0 0 1 0 8", "M6 13v5h3v-4"],
  palette: [
    "M12 3a9 9 0 1 0 0 18c1.7 0 2-1.3 1.2-2.2-.8-.9-.3-2.3 1-2.3H17a4 4 0 0 0 4-4c0-4.4-4-7.5-9-7.5z",
    "M7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "M12 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "M16 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  ],
  brain: ["M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8", "M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8", "M12 4v15"],
};

function Ic({ n, s = 20 }: { n: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {(ICON[n] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const Grad = ({ children }: { children: ReactNode }) => (
  <span style={{ background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{children}</span>
);

const VALUES = [
  { icon: "eye", title: "Honesty over hype", desc: "Every score and match is counted from real postings — never inflated to keep you clicking." },
  { icon: "gauge", title: "Intelligence you can act on", desc: "We don't just measure you. We hand you the specific next step that moves the number." },
  { icon: "heart", title: "Built for the person", desc: "A career is personal. The product stays warm, clear and on your side at every step." },
];

const CRAFTS = [
  { icon: "film", title: "Film Directors", desc: "Shape the narrative and flow — every screen tells a story." },
  { icon: "mega", title: "Digital Marketers", desc: "Make the message land and reach the people who need it." },
  { icon: "palette", title: "Art Directors", desc: "Own the craft, the color and the feel of every pixel." },
  { icon: "brain", title: "AI Scientists", desc: "Build the models that read, benchmark and match — honestly." },
];

const CSS = `
.tza-mode:hover{border-color:#A5B4FC!important;box-shadow:0 10px 26px rgba(99,102,241,.1)}
.tza-cta:hover{filter:brightness(1.1)}
.tza-ghost:hover{border-color:#A5B4FC!important;color:${C.c1}!important}
.tza-crumb:hover{color:#fff!important}
#tza-team{grid-template-columns:repeat(4,1fr)}
@media (max-width:860px){#tza-team{grid-template-columns:repeat(2,1fr)}}
@media (max-width:460px){#tza-team{grid-template-columns:1fr}}
`;

export default async function AboutPage() {
  const [hub, liveProjects] = await Promise.all([
    getBrowseHub(),
    prisma.job.count({ where: { status: "LIVE", kind: "PROJECT" } }).catch(() => 0),
  ]);

  const n = (v: number) => v.toLocaleString();
  /**
   * Counted, and each entry drops out when its count is zero. getBrowseHub
   * degrades to an EMPTY hub when the database is unreachable rather than
   * throwing, so without this guard a transient blip would publish "0 live
   * roles" as a proud headline number. "2 min" is not a count — it describes
   * our own pipeline — so it always stands.
   */
  const counted = [
    { v: hub.totalLive, label: "live roles, verified from company career pages" },
    { v: hub.countries.length, label: hub.countries.length === 1 ? "market with a dedicated, localized page" : "markets with dedicated, localized pages" },
    { v: liveProjects, label: "freelance projects open for bids right now" },
  ].filter((x) => x.v > 0);
  const stats: { big: string; label: string }[] = [
    ...counted.map((x) => ({ big: n(x.v), label: x.label })),
    { big: "2 min", label: "from resume to full career breakdown" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />

      {/* ── Hero ── */}
      <section style={{ background: C.ink, color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -160, right: -100, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.34), transparent 68%)" }} />
        <div style={{ position: "absolute", bottom: -180, left: "12%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,.22), transparent 68%)" }} />
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "64px 24px 68px", position: "relative" }}>
          <nav style={{ fontSize: 12, color: "#8B96B5", marginBottom: 18 }}>
            <Link href="/" className="tza-crumb" style={{ color: "#8B96B5", textDecoration: "none" }}>Topezia</Link>
            <span style={{ color: "#5B6478" }}> › </span>
            <span style={{ color: "#C7CEE4" }}>About</span>
          </nav>
          <div style={S.badge}><Ic n="spark" s={13} />Infinite potential. Intelligent future.</div>
          <h1 style={S.h1}>We built the job search we <Grad>wished existed</Grad></h1>
          <p style={S.heroSub}>
            Topezia replaces the endless scroll with an honest answer: where you stand in your field, and the exact roadmap to the role you want. No noise, no guesswork — just intelligence, applied to your career.
          </p>
        </div>
      </section>

      {/* ── Mission ── */}
      <section style={{ maxWidth: 940, margin: "0 auto", padding: "60px 24px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 40, alignItems: "center" }}>
          <div>
            <div style={S.eyebrow}>Our mission</div>
            <h2 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.24 }}>
              Make every professional legible to the market — and the market legible to them.
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: C.slate }}>
            Most job platforms bury you in listings and leave you guessing why you never hear back. We do the opposite. Topezia&apos;s AI reads your real experience, benchmarks it against every live role in your field, and tells you the truth — what you&apos;re ready for, what&apos;s missing, and how to close the gap. Applying becomes a decision, not a lottery.
          </p>
        </div>
      </section>

      {/* ── Values ── */}
      <section style={{ maxWidth: 940, margin: "0 auto", padding: "44px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 16 }}>
          {VALUES.map((v) => (
            <div key={v.title} style={S.card}>
              <div style={S.cardIcon}><Ic n={v.icon} /></div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{v.title}</h3>
              <p style={{ margin: "9px 0 0", fontSize: 13, lineHeight: 1.65, color: C.mut }}>{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Two ways to work ── */}
      <section style={{ maxWidth: 940, margin: "0 auto", padding: "20px 24px 24px" }}>
        <div style={S.eyebrow}>Built for how work actually happens</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px", maxWidth: 640 }}>A career isn&apos;t only a full-time job</h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: 1.7, color: C.slate, maxWidth: 600 }}>
          We come from the creative world, where the best work is often a project, not a payroll. So Topezia&apos;s intelligence runs both ways — the same honest matching, whether you want a role or a brief.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 16 }}>
          <Link href="/jobs" className="tza-mode" style={{ ...S.card, color: C.ink, textDecoration: "none", display: "block", transition: "border-color .2s, box-shadow .2s" }}>
            <div style={S.cardIcon}><Ic n="briefcase" /></div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Full-time roles</h3>
            <p style={{ margin: "9px 0 14px", fontSize: 13, lineHeight: 1.65, color: C.mut }}>
              AI-matched jobs {hub.countries.length > 0 ? `across ${hub.countries.length} ${hub.countries.length === 1 ? "market" : "markets"}` : "from company career pages"}, scored against your real experience with the reasons behind every fit.
            </p>
            <span style={S.modeCta}>Browse jobs <Ic n="arrow" s={14} /></span>
          </Link>
          <Link href="/projects" className="tza-mode" style={{ ...S.card, color: C.ink, textDecoration: "none", display: "block", transition: "border-color .2s, box-shadow .2s" }}>
            <div style={S.cardIcon}><Ic n="layers" /></div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Freelance projects</h3>
            <p style={{ margin: "9px 0 14px", fontSize: 13, lineHeight: 1.65, color: C.mut }}>
              Briefs and contracts matched to your skills and rate — for the creators, builders and specialists who work project to project.
            </p>
            <span style={S.modeCta}>Browse freelance projects <Ic n="arrow" s={14} /></span>
          </Link>
        </div>
      </section>

      {/* ── Created by ── */}
      <section style={{ maxWidth: 940, margin: "0 auto", padding: "44px 24px" }}>
        <div style={{ background: C.ink, borderRadius: 22, padding: "44px 26px", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -120, right: -70, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)" }} />
          <div style={{ position: "relative", maxWidth: 560 }}>
            <div style={{ ...S.eyebrow, color: "#A5B4FC" }}>Created by Digital Creators</div>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.24 }}>A studio team, not a recruiting agency</h2>
            <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "#B9C0D4" }}>
              Topezia was built by digital creators who spend their days making things people feel — film directors, digital marketers, art directors and AI scientists. That mix is why the product is as intelligent as it is human: rigorous under the hood, effortless on the surface.
            </p>
          </div>
          <div id="tza-team" style={{ position: "relative", display: "grid", gap: 14, marginTop: 30 }}>
            {CRAFTS.map((c) => (
              <div key={c.title} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 14, padding: "20px 18px" }}>
                <div style={{ ...S.cardIcon, width: 40, height: 40, borderRadius: 11, marginBottom: 14 }}><Ic n={c.icon} s={18} /></div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: "#94A3C0", marginTop: 5, lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats — every number counted, none estimated ── */}
      <section style={{ maxWidth: 940, margin: "0 auto", padding: "44px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))", gap: 16 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: "26px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{s.big}</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 6, lineHeight: 1.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ maxWidth: 940, margin: "0 auto", padding: "30px 24px 76px", textAlign: "center" }}>
        <svg width="52" height="38" viewBox="0 0 36 26" style={{ marginBottom: 16 }} aria-hidden>
          <defs><linearGradient id="tzabout" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs>
          <circle cx="10.5" cy="13" r="7.2" stroke="url(#tzabout)" strokeWidth="4.2" fill="none" />
          <circle cx="25.5" cy="13" r="7.2" stroke="url(#tzabout)" strokeWidth="4.2" fill="none" />
        </svg>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.8px" }}>See what we built — on your own career</h2>
        <p style={{ margin: "12px auto 0", fontSize: 13.5, color: C.mut, maxWidth: 420, lineHeight: 1.65 }}>
          Upload your resume and get your AI career breakdown in two minutes. Free while we&apos;re growing.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
          <Link href="/onboard" className="tza-cta" style={S.ctaPrimary}><Ic n="upload" s={16} />Upload your resume</Link>
          <Link href="/jobs" className="tza-ghost" style={S.ctaGhost}>Browse jobs</Link>
          <Link href="/projects" className="tza-ghost" style={S.ctaGhost}>Browse freelance projects</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  badge: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)", color: "#C7CEE4", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "6px 14px", marginBottom: 22 },
  h1: { margin: 0, fontSize: "clamp(30px, 6vw, 44px)", fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1.12, maxWidth: 720 },
  heroSub: { margin: "18px 0 0", fontSize: 15.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 600 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: C.c1, textTransform: "uppercase", marginBottom: 12 },
  card: { border: `1px solid ${C.line}`, borderRadius: 18, padding: 26 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, background: GRAD, color: "#fff", display: "grid", placeItems: "center", marginBottom: 16 },
  modeCta: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: C.c1 },
  ctaPrimary: { display: "inline-flex", alignItems: "center", gap: 8, background: GRAD, color: "#fff", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.35)" },
  ctaGhost: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 600, color: C.slate, textDecoration: "none" },
};
