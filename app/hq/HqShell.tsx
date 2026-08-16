"use client";

/**
 * The chrome every /hq page sits inside: a persistent left nav, a page header,
 * and sign-out.
 *
 * The nav items are REAL ROUTES, not in-page tabs. That is the whole reason
 * this exists: the dashboard used to hide the employer waitlist behind a
 * client-side tab, so it had no URL, could not be linked or bookmarked, and
 * loaded its data whether or not you wanted it. Anything worth navigating to
 * is worth having an address.
 *
 * Counts are optional and passed in by whichever page already has the number —
 * the shell never fetches. A layout that issues its own queries would make
 * every page pay for every badge.
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export interface HqNavCounts {
  members?: number;
  waitlist?: number;
  queue?: number;
  errors?: number;
}

const NAV = [
  { href: "/hq", label: "Members", key: "members" as const },
  { href: "/hq/waitlist", label: "Employer waitlist", key: "waitlist" as const },
  { href: "/hq/posts", label: "Blog posts", key: null },
  { href: "/hq/spam", label: "Review queue", key: "queue" as const },
  { href: "/hq/errors", label: "Error log", key: "errors" as const },
];

async function signOut() {
  await fetch("/api/hq/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/hq";
}

export default function HqShell({
  title,
  subtitle,
  counts,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  counts?: HqNavCounts;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div style={S.wrap}>
      <nav style={S.side}>
        <div style={S.brand}>
          <span style={S.mark} aria-hidden />
          <span>Topezia HQ</span>
        </div>

        <div style={S.navList}>
          {NAV.map((item) => {
            // Exact match for /hq so it doesn't light up on every child route.
            const active = item.href === "/hq" ? pathname === "/hq" : pathname.startsWith(item.href);
            const n = item.key ? counts?.[item.key] : undefined;
            return (
              <Link key={item.href} href={item.href} style={active ? S.navOn : S.navOff}>
                <span>{item.label}</span>
                {typeof n === "number" && <span style={active ? S.badgeOn : S.badgeOff}>{n}</span>}
              </Link>
            );
          })}
        </div>

        <div style={S.sideFoot}>
          <button onClick={signOut} style={S.signOut}>Sign out</button>
          {/* Said once, here, rather than repeated on every page. */}
          <p style={S.privacy}>Real personal data. Uncached, and refused to search engines.</p>
        </div>
      </nav>

      <main style={S.main}>
        <header style={S.head}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={S.h1}>{title}</h1>
            {subtitle && <p style={S.sub}>{subtitle}</p>}
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}

const LINE = "#E2E8F0";
const MUT = "#64748B";
const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";

const S: Record<string, CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    background: "#F8FAFC",
    fontFamily: "var(--font-sora), system-ui, sans-serif",
    color: "#0F172A",
    display: "flex",
    alignItems: "stretch",
    // Wraps to a stacked layout on narrow screens rather than crushing the
    // table — the sidebar becomes a header strip.
    flexWrap: "wrap",
  },
  side: {
    width: 232,
    flex: "1 0 232px",
    maxWidth: 232,
    background: "#fff",
    borderRight: `1px solid ${LINE}`,
    padding: "26px 16px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 22,
    position: "sticky",
    top: 0,
    alignSelf: "flex-start",
    minHeight: "100vh",
    boxSizing: "border-box",
  },
  brand: { display: "flex", alignItems: "center", gap: 9, fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px", padding: "0 8px" },
  mark: { width: 18, height: 18, borderRadius: 6, background: GRAD, display: "inline-block", flex: "none" },
  navList: { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  navOff: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, color: "#334155", textDecoration: "none" },
  navOn: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, color: "#fff", background: GRAD, textDecoration: "none" },
  badgeOff: { fontSize: 11, fontWeight: 700, color: MUT, background: "#F1F5F9", borderRadius: 999, padding: "1px 8px" },
  badgeOn: { fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.22)", borderRadius: 999, padding: "1px 8px" },
  sideFoot: { display: "flex", flexDirection: "column", gap: 12, padding: "0 4px" },
  signOut: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  privacy: { margin: 0, fontSize: 11, color: MUT, lineHeight: 1.5 },
  main: { flex: "999 1 520px", padding: "36px 30px 80px", minWidth: 0 },
  head: { display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 26 },
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.7px", margin: 0 },
  sub: { fontSize: 13.5, color: MUT, margin: "8px 0 0", lineHeight: 1.6, maxWidth: 620 },
};
