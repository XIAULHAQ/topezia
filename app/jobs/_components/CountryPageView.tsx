/**
 * Designed country page (/jobs/{country}) — ported from the "Topezia Jobs
 * Pakistan" design. Server-rendered for SEO.
 *
 * Honesty adaptations from the mock:
 * - Every number is counted from the live corpus (the mock's 2,340 openings,
 *   PKR salary bands, per-city counts and visitor "96% match" badges were
 *   illustrative). Sections whose data we don't have yet — the city grid —
 *   are omitted until we do, same as the country header images.
 * - Salaries display in the posting's own currency, never converted.
 * - The header image renders only for countries that have one (PK today);
 *   the hero stands on its own for the rest.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { SeoPage } from "@/lib/seo/pages";
import { countryName } from "@/lib/seo/pages";
import { COUNTRY_HEADER_IMAGES, type CountryExtras } from "@/lib/seo/country";
import { curSym } from "@/lib/currency";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import AlertCapture from "./AlertCapture";

const C1 = "#8B5CF6", C2 = "#3B82F6";
const INK = "#0F172A", SLATE = "#334155", MUT = "#64748B", LINE = "#E2E8F0";
const GRAD = `linear-gradient(135deg,${C1},${C2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

const PATHS: Record<string, string[]> = {
  pin: ["M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  upload: ["M4 16v4h16v-4", "M12 4v11", "M8 8l4-4 4 4"],
};
function Ic({ n, s = 16 }: { n: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {(PATHS[n] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const AVATAR_BGS = [GRAD, "linear-gradient(135deg,#3B82F6,#22D3EE)", "linear-gradient(135deg,#0F172A,#6366F1)", "linear-gradient(135deg,#059669,#22C55E)", "linear-gradient(135deg,#8B5CF6,#6366F1)", "linear-gradient(135deg,#F97316,#F59E0B)"];

function fmtPay(j: CountryExtras["fresh"][number]): string | null {
  if (j.salaryMin == null && j.salaryMax == null) return null;
  const sym = curSym(j.salaryCurrency);
  const per = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "YEAR" ? "/yr" : "";
  const k = (n: number) => (j.salaryPeriod === "YEAR" && n >= 1000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());
  const lo = j.salaryMin, hi = j.salaryMax;
  if (lo != null && hi != null) return `${sym}${k(lo)}–${k(hi)}${per}`;
  return `${sym}${k((lo ?? hi)!)}${per}`;
}

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

function placeOf(j: CountryExtras["fresh"][number], cName: string): string {
  if (j.remoteScope === "GLOBAL") return "Remote (anywhere)";
  if (j.country) return countryName(j.country);
  return cName;
}

function fresh(d: Date): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3.6e6));
  if (h < 24) return "today";
  return `${Math.round(h / 24)}d ago`;
}

export default function CountryPageView({ page, extras }: { page: SeoPage; extras: CountryExtras }) {
  const iso = page.country!;
  const cName = countryName(iso);
  const headerImg = COUNTRY_HEADER_IMAGES[iso];

  const heroStats: { value: string; label: string }[] = [
    { value: extras.totalEligible.toLocaleString(), label: `live openings open to applicants in ${cName}` },
    { value: extras.postedLast7d.toLocaleString(), label: "posted in the last 7 days" },
    { value: `${extras.remoteSharePct}%`, label: "remote — hireable from anywhere" },
    ...(extras.medianAgeDays != null ? [{ value: `${extras.medianAgeDays} days`, label: "median posting age" }] : []),
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: INK }}>
      <SiteNav />

      {/* ── Country hero ── */}
      <section style={{ background: "#0F172A", color: "#fff", position: "relative", overflow: "hidden" }}>
        {headerImg && (
          <div style={{ position: "absolute", inset: 0, opacity: 0.16, mixBlendMode: "luminosity", WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,1) 30%, transparent 85%)", maskImage: "linear-gradient(to left, rgba(0,0,0,1) 30%, transparent 85%)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={headerImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
          </div>
        )}
        <div style={{ position: "absolute", top: -160, right: -100, width: 520, height: 520, borderRadius: "50%", background: `radial-gradient(circle, rgba(139,92,246,.34), transparent 68%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -180, left: "15%", width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, rgba(59,130,246,.22), transparent 68%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 24px 60px", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)", color: "#C7CEE4", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "6px 14px", marginBottom: 20 }}>
            <Ic n="pin" s={13} />Jobs in {cName}
          </div>
          <h1 style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: "-1.4px", lineHeight: 1.14, maxWidth: 640 }}>
            Find your next role in <span style={{ background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{cName}</span>
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 560 }}>
            Roles located in {cName} plus remote jobs hireable from anywhere — every one AI-matched to your profile, with an honest score and the reasons behind it.
          </p>
          <Link href="/onboard" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28, maxWidth: 560, background: "#fff", borderRadius: 14, padding: "14px 18px", boxShadow: "0 16px 44px rgba(0,0,0,.3)", textDecoration: "none" }}>
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

      {/* ── In-demand fields (real counts; the mock's city grid returns when we have city data) ── */}
      {extras.fields.length > 0 && (
        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 10px" }}>
          <h2 style={S.h2}>What {cName} is hiring for</h2>
          <p style={S.sub}>Counted from live postings open to applicants in {cName}, updated daily.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {extras.fields.map((fd) => (
              <Link key={fd.slug} href={`/jobs/${fd.slug}`} style={S.cardLink}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: GRAD, color: "#fff", display: "grid", placeItems: "center", flex: "none", fontSize: 15, fontWeight: 800 }}>{fd.name[0]}</span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, flex: 1 }}>{fd.name}</span>
                  <span style={{ background: "#EEF2FF", color: "#4F46E5", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", flex: "none" }}>{fd.count} roles</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUT }}>
                  <span>New this week</span><span style={{ fontWeight: 700, color: "#059669" }}>{fd.new7d > 0 ? `+${fd.new7d}` : "—"}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Market snapshot ── */}
      {extras.snapshot.length > 0 && (
        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px" }}>
          <div style={{ background: "#0F172A", borderRadius: 22, padding: "40px 44px", color: "#fff", position: "relative", overflow: "hidden", display: "flex", gap: 44, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "absolute", top: -120, right: -70, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)" }} />
            <div style={{ flex: 1, minWidth: 280, position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: "#A5B4FC", textTransform: "uppercase", marginBottom: 12 }}>{cName} market snapshot</div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.22 }}>Know where you stand before you apply</h2>
              <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 420 }}>
                Topezia benchmarks your profile against every live posting open to {cName} — which skills are asked for, what they pay, and the exact gap between you and the role you want.
              </p>
              <Link href="/onboard" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 22, background: GRAD, borderRadius: 11, padding: "12px 22px", fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.4)" }}>
                Get your free breakdown <Ic n="arrow" s={14} />
              </Link>
            </div>
            <div style={{ flex: 1, minWidth: 280, position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
              {extras.snapshot.map((sn) => (
                <div key={sn.text} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 14, padding: "15px 19px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", minWidth: 74 }}>{sn.big}</div>
                  <div style={{ fontSize: 12, color: "#C7CEE4", lineHeight: 1.55 }}>{sn.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Fresh roles (real listings, linked; no match % for anonymous visitors) ── */}
      {extras.fresh.length > 0 && (
        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "6px 24px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
            <h2 style={{ ...S.h2, margin: 0, flex: 1 }}>Fresh this week in {cName}</h2>
            <Link href="/onboard" style={{ fontSize: 13, fontWeight: 700, color: C1, textDecoration: "none" }}>See them matched to you →</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {extras.fresh.map((jb, i) => {
              const pay = fmtPay(jb);
              return (
                <Link key={jb.id} href={`/job/${jb.id}`} style={{ ...S.cardLink, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "17px 20px", borderRadius: 15 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: AVATAR_BGS[i % AVATAR_BGS.length], color: "#fff", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, flex: "none" }}>
                    {(jb.companyName || "?")[0].toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{jb.titleRaw}</span>
                    <span style={{ display: "block", fontSize: 12, color: MUT, marginTop: 3 }}>{jb.companyName} · {placeOf(jb, cName)} · {label(jb.employmentType)}</span>
                  </span>
                  {pay && <span style={{ fontSize: 12.5, fontWeight: 700, color: "#059669", flex: "none" }}>{pay}</span>}
                  <span style={{ background: "#EEF2FF", color: "#4F46E5", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 12px", flex: "none" }}>{fresh(jb.firstSeenAt)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Email alerts (kept from the working page — real, wired) ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 0" }}>
        <AlertCapture slug={page.slug} place={page.slug} label={`jobs open to ${cName}`} />
      </section>

      {/* ── CTA ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px 72px", textAlign: "center" }}>
        <svg width={52} height={38} viewBox="0 0 36 26" style={{ marginBottom: 16 }} aria-hidden>
          <defs><linearGradient id="tzg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C1} /><stop offset="1" stopColor={C2} /></linearGradient></defs>
          <circle cx="10.5" cy="13" r="7.2" stroke="url(#tzg)" strokeWidth="4.2" fill="none" /><circle cx="25.5" cy="13" r="7.2" stroke="url(#tzg)" strokeWidth="4.2" fill="none" />
        </svg>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.8px" }}>Your career in {cName} starts with one upload</h2>
        <p style={{ margin: "12px auto 0", fontSize: 13.5, color: MUT, maxWidth: 420, lineHeight: 1.65 }}>
          Drop in your resume — our AI builds your profile, scores it against every role open to {cName}, and shows you the ones worth your time.
        </p>
        <Link href="/onboard" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 24, background: GRAD, color: "#fff", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.35)" }}>
          <Ic n="upload" />Upload your resume
        </Link>
      </section>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  h2: { margin: "0 0 6px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.6px" },
  sub: { margin: "0 0 24px", fontSize: 13, color: MUT },
  cardLink: { border: `1px solid ${LINE}`, borderRadius: 16, padding: 22, color: INK, display: "block", textDecoration: "none" },
};
