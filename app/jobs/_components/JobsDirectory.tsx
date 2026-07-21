"use client";

/**
 * /jobs directory — ported from the "Topezia Jobs" design.
 *
 * Honesty adaptations from the mock, which shipped illustrative data:
 * - Every count is the real corpus (the mock's 48,200 openings, 18,900 India,
 *   per-category thousands and "31% of tech roles name AI skills" were
 *   placeholders). Sections with nothing real behind them are omitted rather
 *   than padded.
 * - "Popular searches" link only to role x country pages that actually clear
 *   the publish floor, so no chip lands on a 404.
 * - The hero search filters THIS directory live. It is not full-text job
 *   search, which does not exist yet, so it is labelled for what it does
 *   rather than dressed up as something it is not.
 */
import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { HubLink } from "@/lib/seo/pages";

const C1 = "#8B5CF6", C2 = "#3B82F6";
const INK = "#0F172A", SLATE = "#334155", MUT = "#64748B", LINE = "#E2E8F0";
const GRAD = `linear-gradient(135deg,${C1},${C2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

const PATHS: Record<string, string[]> = {
  search: ["M21 21l-4.35-4.35", "M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"],
  pin: ["M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  upload: ["M4 16v4h16v-4", "M12 4v11", "M8 8l4-4 4 4"],
  code: ["M8 6l-6 6 6 6", "M16 6l6 6-6 6"],
  chat: ["M4 4h16v12H7l-3 3z"],
  coins: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M15 9.5c-.6-1-1.7-1.5-3-1.5-1.8 0-3 1-3 2s1 1.7 3 2 3 1 3 2-1.2 2-3 2c-1.3 0-2.4-.5-3-1.5", "M12 6.5v11"],
  pen: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  truck: ["M1 7h13v10H1z", "M14 10h4l3 3v4h-7z", "M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  grad: ["M2 9l10-5 10 5-10 5z", "M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"],
  heart: ["M12 21C5 15 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 12 19 15 12 21z"],
  chart: ["M4 20V4", "M4 20h16", "M8 16v-5", "M13 16V8", "M18 16v-8"],
  users: ["M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21c1.2-3 3.8-4.5 7-4.5s5.8 1.5 7 4.5", "M17 4a4 4 0 0 1 0 8", "M22 21c-.6-2-1.9-3.3-3.5-4"],
  mega: ["M3 11v2l12 5V6L3 11z", "M15 8a3 3 0 0 1 0 8", "M6 13v5h3v-4"],
  box: ["M3 7l9-4 9 4-9 4-9-4z", "M3 7v10l9 4 9-4V7", "M12 11v10"],
};
function Ic({ n, s = 16 }: { n: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {(PATHS[n] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Our verticals mapped onto the design's icon set. */
const VERTICAL_ICON: Record<string, string> = {
  "tech-software": "code", sales: "coins", "operations-hr": "users",
  "finance-accounting": "coins", "customer-support": "chat", marketing: "mega",
  "retail-hospitality": "box", "design-creative": "pen", "trucking-logistics": "truck",
  "healthcare-allied": "heart", "education-training": "grad", "data-analytics": "chart",
};

/** Flag from the ISO code — regional indicator letters, no lookup table. */
function flagOf(iso?: string): string {
  if (!iso || iso.length !== 2) return "🌐";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const CSS = `
#tzc-grid{grid-template-columns:repeat(3,1fr)}
#tzcat-grid{grid-template-columns:repeat(4,1fr)}
@media (max-width:860px){#tzc-grid{grid-template-columns:repeat(2,1fr)}#tzcat-grid{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){#tzc-grid,#tzcat-grid{grid-template-columns:1fr}}
@media (max-width:640px){.tzj-search{flex-direction:column;align-items:stretch}.tzj-search > div{border-right:none!important}.tzj-h1{font-size:30px!important}}
.tzj-card:hover{border-color:#A5B4FC;box-shadow:0 10px 26px rgba(99,102,241,.1)}
.tzj-chip:hover{border-color:#A5B4FC;color:${C1};background:#F8FAFF}
.tzj-more:hover{border-color:#A5B4FC;color:${C1}}
`;

const ROWS_STEP = 3;

export default function JobsDirectory({
  totalLive, countries, verticals, roles, skills, popular, postedLast7d, medianAgeDays,
}: {
  totalLive: number; countries: HubLink[]; verticals: HubLink[]; roles: HubLink[]; skills: HubLink[];
  popular: HubLink[]; postedLast7d: number; medianAgeDays: number | null;
}) {
  const [rowsC, setRowsC] = useState(ROWS_STEP);
  const [rowsCat, setRowsCat] = useState(ROWS_STEP);

  const cShown = rowsC * 3, catShown = rowsCat * 4;
  const countriesVis = countries.slice(0, cShown);
  const categoriesVis = verticals.slice(0, catShown);

  const heroStats = [
    { value: totalLive.toLocaleString(), label: "live openings, counted from real postings" },
    { value: postedLast7d.toLocaleString(), label: "posted in the last 7 days" },
    { value: String(countries.length), label: "markets with a dedicated page" },
    ...(medianAgeDays !== null ? [{ value: `${medianAgeDays} days`, label: "median posting age" }] : []),
  ];

  return (
    <div style={{ background: "#fff", fontFamily: FONT, color: INK, overflowX: "clip" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Hero ── */}
      <section style={{ background: "#0F172A", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -160, right: -100, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.34), transparent 68%)" }} />
        <div style={{ position: "absolute", bottom: -180, left: "15%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,.22), transparent 68%)" }} />
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 24px 60px", position: "relative" }}>
          <nav style={{ fontSize: 12, color: "#8B96B5", marginBottom: 18 }}>
            <Link href="/" style={{ color: "#8B96B5", textDecoration: "none" }}>Topezia</Link>{" "}
            <span style={{ color: "#5B6478" }}>›</span> <span style={{ color: "#C7CEE4" }}>Jobs</span>
          </nav>
          <h1 className="tzj-h1" style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: "-1.4px", lineHeight: 1.14, maxWidth: 680 }}>
            Browse jobs by <span style={{ background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>country and field</span>
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 600 }}>
            Explore live openings across every market we cover. Upload your resume once and each role shows an honest AI match score — so you apply where you can actually win.
          </p>

          {/* Same upload card as the country pages — one entry point sitewide. */}
          <Link href="/onboard" style={S.uploadCard}>
            <span style={{ width: 42, height: 42, borderRadius: 11, background: GRAD, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Ic n="upload" /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: INK }}>Paste as text or upload your resume</span>
              <span style={{ display: "block", fontSize: 12, color: MUT, marginTop: 3, lineHeight: 1.5 }}>Our AI reads it and builds your profile + career score in 2 minutes</span>
            </span>
            <span style={{ color: C1, flex: "none" }}><Ic n="arrow" s={14} /></span>
          </Link>

          <div style={{ display: "flex", gap: 0, marginTop: 30, borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 22, flexWrap: "wrap" }}>
            {heroStats.map((hs) => (
              <div key={hs.label} style={{ flex: 1, minWidth: 140, paddingRight: 24 }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{hs.value}</div>
                <div style={{ fontSize: 11.5, color: "#8B96B5", marginTop: 3, lineHeight: 1.45 }}>{hs.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Countries ── */}
      <section style={S.section}>
        <h2 style={S.h2}>Jobs by country</h2>
        <p style={S.sub}>Roles located there plus remote jobs hireable from anywhere.</p>
        <div id="tzc-grid" style={{ display: "grid", gap: 16 }}>
            {countriesVis.map((c) => (
              <Link key={c.href} href={c.href} className="tzj-card" style={S.card}>
                <span style={{ fontSize: 30, lineHeight: 1, flex: "none" }}>{flagOf(c.iso)}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: MUT, marginTop: 3 }}>{c.count.toLocaleString()} open roles</span>
                </span>
                <span style={{ color: C1 }}><Ic n="arrow" s={14} /></span>
              </Link>
          ))}
        </div>
        {countries.length > cShown && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setRowsC((r) => r + ROWS_STEP)} className="tzj-more" style={S.more}>View more countries</button>
          </div>
        )}
        {countries.length <= cShown && cShown > ROWS_STEP * 3 && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setRowsC(ROWS_STEP)} className="tzj-more" style={S.more}>Show fewer countries</button>
          </div>
        )}
      </section>

      {/* ── Categories ── */}
      <section style={S.section}>
        <h2 style={S.h2}>Jobs by category</h2>
        <p style={S.sub}>The fields hiring most across every Topezia market right now.</p>
        <div id="tzcat-grid" style={{ display: "grid", gap: 16 }}>
            {categoriesVis.map((v) => (
              <Link key={v.href} href={v.href} className="tzj-card" style={{ ...S.card, padding: 20 }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: GRAD, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                  <Ic n={VERTICAL_ICON[v.href.replace("/jobs/", "")] ?? "box"} s={18} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{v.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: MUT, marginTop: 2 }}>{v.count.toLocaleString()} roles</span>
                </span>
              </Link>
          ))}
        </div>
        {verticals.length > catShown && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setRowsCat((r) => r + ROWS_STEP)} className="tzj-more" style={S.more}>View more categories</button>
          </div>
        )}
      </section>

      {/* ── Skill hubs ── */}
      {skills.length > 0 && (
        <section style={S.section}>
          <h2 style={S.h2}>Jobs and freelance work by craft</h2>
          <p style={S.sub}>
            Emerging crafts where the work shows up as both salaried roles and freelance briefs. Each page carries both, because
            for this kind of work one without the other is half the picture.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {skills.map((h) => (
              <Link key={h.href} href={h.href} className="tzj-card" style={{ ...S.card, padding: "14px 18px", flex: "0 1 auto" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{h.label}</span>
                <span style={{ fontSize: 11.5, color: MUT, marginLeft: 8 }}>{h.count} openings &amp; briefs</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Market snapshot ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px" }}>
        <div style={{ background: "#0F172A", borderRadius: 22, padding: "40px 44px", color: "#fff", position: "relative", overflow: "hidden", display: "flex", gap: 44, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "absolute", top: -120, right: -70, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)" }} />
          <div style={{ flex: 1, minWidth: 280, position: "relative" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: "#A5B4FC", textTransform: "uppercase", marginBottom: 12 }}>Why browse on Topezia</div>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.22 }}>Not a job board. A match engine.</h2>
            <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 420 }}>
              Upload your resume once and every listing you browse shows a real AI match, the skills it values, and what to add before you apply.
            </p>
            <Link href="/onboard" style={S.darkCta}>Get your free breakdown <Ic n="arrow" s={14} /></Link>
          </div>
          <div style={{ flex: 1, minWidth: 280, position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { big: totalLive.toLocaleString(), text: "live postings across all Topezia markets, re-checked daily" },
              { big: postedLast7d.toLocaleString(), text: "posted in the last 7 days" },
              { big: "2 min", text: "to a full AI breakdown of where you stand" },
            ].map((sn) => (
              <div key={sn.text} style={S.snap}>
                <div style={S.snapBig}>{sn.big}</div>
                <div style={{ fontSize: 12, color: "#C7CEE4", lineHeight: 1.55 }}>{sn.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roles ──
          Kept as its own section, not just a search result: these are the
          role pages, and without a permanent link here nothing on the site
          would point at them. */}
      {roles.length > 0 && (
        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "6px 24px 20px" }}>
          <h2 style={S.h2}>Jobs by role</h2>
          <p style={S.sub}>Every role with enough live openings to have its own page.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {roles.map((r) => (
              <Link key={r.href} href={r.href} className="tzj-chip" style={S.chip}>
                {r.label} <span style={{ color: MUT, fontWeight: 700 }}>{r.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Popular searches (only real, publishable pages) ── */}
      {popular.length > 0 && (
        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "6px 24px 20px" }}>
          <h2 style={S.h2}>Popular searches</h2>
          <p style={S.sub}>Role-and-country pages with the most live openings.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {popular.map((p) => (
              <Link key={p.href} href={p.href} className="tzj-chip" style={S.chip}>{p.label}</Link>
            ))}
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px" }}>
        <h2 style={{ ...S.h2, marginBottom: 24 }}>Frequently asked questions</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 16 }}>
          {[
            { q: "How often are jobs updated?", a: "Listings are re-crawled and re-verified daily, and postings that close are removed — the counts here are what is actually open." },
            { q: "What is an AI match score?", a: "Once you upload a resume, each role shows how well your skills fit it, which ones it values, and what is missing — including the low scores." },
            { q: "Is Topezia free to use?", a: "Yes — browsing, building your profile and your career score are all free while we are growing." },
            { q: "Which countries are covered?", a: `${countries.length} markets have a dedicated page today, and a country appears as soon as enough roles are open to applicants there.` },
          ].map((f) => (
            <div key={f.q} style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 24px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14.5, fontWeight: 700 }}>{f.q}</h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: MUT }}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 24px 72px", textAlign: "center" }}>
        <svg width={52} height={38} viewBox="0 0 36 26" style={{ marginBottom: 16 }} aria-hidden>
          <defs><linearGradient id="tzjg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C1} /><stop offset="1" stopColor={C2} /></linearGradient></defs>
          <circle cx="10.5" cy="13" r="7.2" stroke="url(#tzjg)" strokeWidth="4.2" fill="none" />
          <circle cx="25.5" cy="13" r="7.2" stroke="url(#tzjg)" strokeWidth="4.2" fill="none" />
        </svg>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.8px" }}>Stop scrolling. Start matching.</h2>
        <p style={{ margin: "12px auto 0", fontSize: 13.5, color: MUT, maxWidth: 420, lineHeight: 1.65 }}>
          Drop in your resume — our AI builds your profile, scores it against the market, and shows you the roles worth your time.
        </p>
        <Link href="/onboard" style={S.cta}><Ic n="upload" />Upload your resume</Link>
      </section>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  section: { maxWidth: 1080, margin: "0 auto", padding: "52px 24px 10px" },
  h2: { margin: "0 0 6px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.6px" },
  sub: { margin: "0 0 24px", fontSize: 13, color: MUT },
  empty: { fontSize: 13.5, color: MUT, background: "#F8FAFC", border: `1px dashed ${LINE}`, borderRadius: 14, padding: "22px 20px", margin: 0 },
  card: { border: `1px solid ${LINE}`, borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", gap: 14, color: INK, textDecoration: "none", transition: "border-color .2s, box-shadow .2s" },
  chip: { border: `1px solid ${LINE}`, borderRadius: 999, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, color: SLATE, textDecoration: "none", display: "inline-flex", gap: 7, transition: "all .2s" },
  more: { display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${LINE}`, borderRadius: 999, padding: "10px 22px", fontSize: 12.5, fontWeight: 600, color: SLATE, cursor: "pointer", background: "#fff", fontFamily: "inherit", transition: "all .2s" },
  uploadCard: { display: "flex", alignItems: "center", gap: 14, marginTop: 28, maxWidth: 560, background: "#fff", borderRadius: 14, padding: "14px 18px", boxShadow: "0 16px 44px rgba(0,0,0,.3)", textDecoration: "none" },
  darkCta: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 22, background: GRAD, borderRadius: 11, padding: "12px 22px", fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.4)" },
  snap: { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 14, padding: "15px 19px", display: "flex", alignItems: "center", gap: 16 },
  snapBig: { fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", minWidth: 80 },
  cta: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 24, background: GRAD, color: "#fff", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.35)" },
};
