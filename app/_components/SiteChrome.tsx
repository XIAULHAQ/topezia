"use client";

/**
 * THE site-wide public chrome: one header bar and one footer, used identically
 * on the homepage, /jobs pages, country pages, job details and public
 * profiles.
 *
 * Nav is the homepage bar with "Pricing" replaced by "Freelance Projects" — per
 * product call, pricing lives behind the employer waitlist for now.
 *
 * The pages using this are statically cached (SEO), so the session can't be
 * known server-side — the right-hand links hydrate after load and swap to
 * Feed/Profile for signed-in users (defaulting to the anonymous nav so
 * logged-out visitors never see a wrong flash).
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const FONT = "var(--font-sora), system-ui, sans-serif";

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
  { label: "Freelance Projects", href: "/projects" },
  // /coach is auth-gated: anonymous visitors get bounced to /login, which
  // carries the "join by uploading your resume" path to /onboard.
  { label: "AI Career Coach", href: "/coach" },
  { label: "For employers", href: "/waitlist" },
];

/**
 * Below 720px the inline nav is hidden. It used to be hidden with nothing in
 * its place, so phone visitors had NO navigation at all — jobs, projects and
 * the coach were unreachable from the header. The burger + panel below is that
 * missing route. The sign-in/join pair moves into the panel at the same
 * breakpoint: at 375px it was wrapping "Sign in" and "Join free" onto two lines
 * each and crowding the logo.
 */
const CHROME_CSS = `
.tzc-link:hover{color:${C.c1}!important}
.tzc-flink:hover{color:#fff!important}
.tzc-bright:hover{filter:brightness(1.1)}
.tzc-burger{display:none}
.tzc-mlink:hover{background:#F5F3FF!important;color:${C.c1}!important}
@media (max-width:720px){
  .tzc-nav{display:none!important}
  .tzc-auth{display:none!important}
  .tzc-burger{display:grid!important}
}
@media (min-width:721px){ .tzc-menu{display:none!important} }
`;

export function SiteHeader() {
  // null = unknown (render anonymous default; no wrong flash for visitors).
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session))).catch(() => {});
  }, []);

  // Close on navigation. Next's client routing keeps this component mounted, so
  // without this the panel stays open on top of the page you just opened.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Escape closes, and the page behind must not scroll under an open panel.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  const accountLinks = authed
    ? [{ label: "My feed", href: "/feed" }, { label: "My profile", href: "/profile" }]
    : [{ label: "Sign in", href: "/login" }];

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
        <div className="tzc-auth" style={S.authRow}>
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

        <button
          type="button"
          className="tzc-burger"
          style={S.burger}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="tzc-mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2} strokeLinecap="round">
            {menuOpen
              ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
              : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <>
          {/* Tap-outside target. Sits under the panel, over the page. */}
          <div style={S.scrim} onClick={() => setMenuOpen(false)} aria-hidden />
          <div id="tzc-mobile-menu" className="tzc-menu" style={S.menu}>
            {/*
              Close on tap, not just on the pathname effect below. Waiting for
              the route to resolve leaves the panel sitting over the page for
              the whole navigation — barely visible on a fast connection, a
              second or more of looking-broken on a slow phone.
            */}
            {NAV_LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="tzc-mlink" style={S.mlink} onClick={close}>{l.label}</Link>
            ))}
            <div style={S.mDivider} />
            {accountLinks.map((l) => (
              <Link key={l.label} href={l.href} className="tzc-mlink" style={S.mlink} onClick={close}>{l.label}</Link>
            ))}
            {!authed && (
              <Link href="/onboard" className="tzc-bright" style={S.mCta} onClick={close}>Join free</Link>
            )}
          </div>
        </>
      )}
    </header>
  );
}

const FOOTER_COLS = [
  { head: "Product", links: [{ label: "Find jobs", href: "/jobs" }, { label: "Freelance Projects", href: "/projects" }, { label: "Portfolios", href: "/portfolio" }, { label: "AI Career Score", href: "/onboard" }, { label: "Skill assessments", href: "/onboard" }, { label: "Resume builder", href: "/onboard" }] },
  { head: "Employers", links: [{ label: "Post a role", href: "/waitlist" }, { label: "Search talent", href: "/waitlist" }, { label: "Pricing", href: "/waitlist" }] },
  { head: "Company", links: [{ label: "About", href: "/about" }, { label: "Contact", href: "/waitlist" }] },
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
  // Solid, NOT frosted. `backdrop-filter: blur()` on a sticky full-width header
  // forces the compositor to re-read and re-blur the entire header strip every
  // scrolled frame, and that cost scales with painted area — invisible at 709px
  // but measured on a 1411px/2x window at avg 20.1ms/frame with 11 frames over
  // 25ms, versus 16.7ms and zero dropped frames with the blur off. At the old
  // .92 alpha the blur only acted on the 8% showing through, so it bought
  // almost nothing visually. Anything above ~.95 without a blur ghosts sharp
  // text through the bar, so this is fully opaque.
  header: { background: "#fff", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 50, fontFamily: FONT },
  // Lifted above the scrim: both are children of <header>, so inside that
  // stacking context a plain bar would be painted over and dimmed by its own
  // menu's backdrop — logo and close button included.
  headerInner: { position: "relative", zIndex: 61, maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 26, background: "#fff" },
  authRow: { display: "flex", alignItems: "center", gap: 8, flex: "none" },

  burger: { width: 40, height: 40, placeItems: "center", flex: "none", background: "none", border: "none", padding: 0, cursor: "pointer", marginLeft: "auto" },
  // Covers the page, not the header — the panel itself sits above this.
  scrim: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,.35)", zIndex: 40 },
  menu: {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60,
    background: "#fff", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
    boxShadow: "0 18px 40px rgba(15,23,42,.14)",
    padding: 10, display: "flex", flexDirection: "column", gap: 2,
    // A long enough list must scroll rather than run off a short phone screen.
    maxHeight: "calc(100vh - 100%)", overflowY: "auto",
  },
  mlink: { display: "block", padding: "13px 14px", borderRadius: 10, color: C.slate, textDecoration: "none", fontSize: 15, fontWeight: 600 },
  mDivider: { height: 1, background: C.line, margin: "8px 4px" },
  mCta: { display: "block", textAlign: "center", margin: "6px 4px 4px", padding: "13px 18px", background: `linear-gradient(135deg,${C.c1},${C.c2})`, color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 700, textDecoration: "none" },
  hnav: { display: "flex", gap: 22, fontSize: 13, fontWeight: 500, color: C.slate, flexWrap: "wrap" },
  hlink: { color: C.slate, textDecoration: "none" },
  joinBtn: { background: `linear-gradient(135deg,${C.c1},${C.c2})`, color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 6px 16px rgba(99,102,241,.3)" },
  footInner: { maxWidth: 1180, margin: "0 auto", padding: "44px 24px 30px", display: "flex", gap: 30, flexWrap: "wrap" },
};
