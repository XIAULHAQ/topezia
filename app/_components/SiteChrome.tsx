"use client";

/**
 * THE site-wide public chrome: one header bar and one footer, used identically
 * on the homepage, /jobs pages, country pages, job details and public
 * profiles.
 *
 * Nav is the homepage bar with "Pricing" replaced by "Projects" (the freelance
 * projects feed) — per product call, pricing lives behind the employer
 * waitlist for now.
 *
 * The pages using this are statically cached (SEO), so the session can't be
 * known server-side — the right-hand links hydrate after load and swap to
 * Feed/Profile for signed-in users (defaulting to the anonymous nav so
 * logged-out visitors never see a wrong flash).
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const FONT = "'Sora', system-ui, sans-serif";

export function Brand({ h = 26 }: { h?: number }) {
  return (
    <svg width={(h / 26) * 36} height={h} viewBox="0 0 36 26" aria-hidden>
      <defs><linearGradient id="tzchrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs>
      <circle cx="10.5" cy="13" r="7.2" stroke="url(#tzchrome)" strokeWidth="4.2" fill="none" />
      <circle cx="25.5" cy="13" r="7.2" stroke="url(#tzchrome)" strokeWidth="4.2" fill="none" />
    </svg>
  );
}

const NAV_LINKS = [
  { label: "Find jobs", href: "/jobs" },
  { label: "Projects", href: "/projects" },
  // /coach is auth-gated: anonymous visitors get bounced to /login, which
  // carries the "join by uploading your résumé" path to /onboard.
  { label: "AI Career Coach", href: "/coach" },
  { label: "For employers", href: "/waitlist" },
];

const CHROME_CSS = `
.tzc-link:hover{color:${C.c1}!important}
.tzc-flink:hover{color:#fff!important}
.tzc-bright:hover{filter:brightness(1.1)}
@media (max-width:720px){ .tzc-nav{display:none!important} }
`;

export function SiteHeader() {
  // null = unknown (render anonymous default; no wrong flash for visitors).
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session))).catch(() => {});
  }, []);

  return (
    <header style={S.header}>
      <style>{CHROME_CSS}</style>
      <div style={S.headerInner}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: C.ink, textDecoration: "none" }}>
          <Brand /><span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span>
        </Link>
        <nav className="tzc-nav" style={S.hnav}>
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="tzc-link" style={S.hlink}>{l.label}</Link>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        {authed ? (
          <>
            <Link href="/feed" className="tzc-link" style={{ ...S.hlink, padding: "9px 14px" }}>My feed</Link>
            <Link href="/profile" className="tzc-bright" style={S.joinBtn}>My profile</Link>
          </>
        ) : (
          <>
            <Link href="/login" className="tzc-link" style={{ ...S.hlink, padding: "9px 14px" }}>Sign in</Link>
            <Link href="/onboard" className="tzc-bright" style={S.joinBtn}>Join free</Link>
          </>
        )}
      </div>
    </header>
  );
}

const FOOTER_COLS = [
  { head: "Product", links: [{ label: "Find jobs", href: "/jobs" }, { label: "Freelance projects", href: "/projects" }, { label: "AI Career Score", href: "/onboard" }, { label: "Skill assessments", href: "/onboard" }, { label: "Resume builder", href: "/onboard" }] },
  { head: "Employers", links: [{ label: "Post a role", href: "/waitlist" }, { label: "Search talent", href: "/waitlist" }, { label: "Pricing", href: "/waitlist" }] },
  { head: "Company", links: [{ label: "About", href: "/" }, { label: "Contact", href: "/waitlist" }] },
  { head: "Legal", links: [{ label: "Privacy Policy", href: "/privacy" }, { label: "Terms of Service", href: "/terms" }, { label: "Cookie Policy", href: "/cookies" }] },
];

export function SiteFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${C.line}`, background: C.ink, color: "#fff", fontFamily: FONT }}>
      <style>{CHROME_CSS}</style>
      <div style={S.footInner}>
        <div style={{ flex: 1.4, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Brand h={22} /><span style={{ fontSize: 18, fontWeight: 700 }}>topezia</span></div>
          <div style={{ fontSize: 12, color: "#8B96B5", marginTop: 12, lineHeight: 1.6 }}>Infinite potential. Intelligent future.</div>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.head} style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{col.head}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12 }}>
              {col.links.map((l) => <Link key={l.label} href={l.href} className="tzc-flink" style={{ color: "#8B96B5", textDecoration: "none" }}>{l.label}</Link>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", fontSize: 11, color: "#64748B" }}>© 2026 Topezia. All rights reserved.</div>
      </div>
    </footer>
  );
}

const S: Record<string, CSSProperties> = {
  header: { background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 50, fontFamily: FONT },
  headerInner: { maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 26 },
  hnav: { display: "flex", gap: 22, fontSize: 13, fontWeight: 500, color: C.slate, flexWrap: "wrap" },
  hlink: { color: C.slate, textDecoration: "none" },
  joinBtn: { background: `linear-gradient(135deg,${C.c1},${C.c2})`, color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 6px 16px rgba(99,102,241,.3)" },
  footInner: { maxWidth: 1180, margin: "0 auto", padding: "44px 24px 30px", display: "flex", gap: 30, flexWrap: "wrap" },
};
