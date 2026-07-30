"use client";

/**
 * The employer area's section nav.
 *
 * A horizontal strip rather than a sidebar on purpose: /employer already sits
 * inside AppShell, which owns the left rail. A second vertical nav nested in
 * the first reads as two competing hierarchies and halves the width the
 * content gets on a laptop.
 *
 * Every entry is a real page. Nothing here is a "Soon" placeholder — the
 * employer dashboard already carries enough not-yet-real surface in the
 * design it was built from (see employer-client.tsx), and a nav that lies
 * about what exists is worse than a shorter nav.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

const TABS: { href: string; label: string }[] = [
  { href: "/employer", label: "Overview" },
  { href: "/employer/work", label: "Work" },
  { href: "/employer/testimonials", label: "Testimonials" },
  { href: "/employer/clients", label: "Clients" },
  { href: "/employer/articles", label: "Articles" },
  { href: "/employer/team", label: "Team" },
];

export default function EmployerTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav style={S.bar} aria-label="Company sections">
      {TABS.map((t) => {
        // "/employer" must not light up for every child route, so the overview
        // matches exactly and everything else matches its subtree (the article
        // editor lives under /employer/articles/{id}).
        const active = t.href === "/employer" ? pathname === "/employer" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} style={{ ...S.tab, ...(active ? S.on : {}) }} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Shared page furniture for the company sections, so six pages can't drift
 * into six slightly different headers.
 */
export function EmployerSection({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={S.wrap}>
      <EmployerTabs />
      <header style={S.head}>
        <div style={{ minWidth: 0 }}>
          <h1 style={S.h1}>{title}</h1>
          {subtitle && <p style={S.sub}>{subtitle}</p>}
        </div>
        {actions && <div style={{ flex: "none", display: "flex", gap: 10 }}>{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/**
 * The two ways a company section can have nothing to show through no fault of
 * the data: you aren't signed in, or you are but have no company page yet.
 *
 * Both are answers the API gives (401 and 409), and both used to fall through
 * to "Couldn't load…", which tells someone their browser is broken when in
 * fact they just need to sign in. One component so five pages say the same
 * thing.
 */
export function EmployerGate({ title, reason, what }: { title: string; reason: "auth" | "company"; what: string }) {
  return (
    <EmployerSection title={title}>
      <div style={ES.card}>
        {reason === "auth" ? (
          <p style={ES.empty}>
            Sign in to manage {what}.{" "}
            <a href={`/login?next=/employer`} style={{ color: "#4F46E5", fontWeight: 700 }}>Sign in →</a>
          </p>
        ) : (
          <p style={ES.empty}>
            {what[0].toUpperCase() + what.slice(1)} lives on your company page, so you&apos;ll need one first.{" "}
            <a href="/employer" style={{ color: "#4F46E5", fontWeight: 700 }}>Create it on the overview</a> — it takes a
            name and a sentence.
          </p>
        )}
      </div>
    </EmployerSection>
  );
}

export const ES: Record<string, CSSProperties> = {
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: "20px 22px" },
  btn: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", fontFamily: "inherit", display: "inline-block" },
  btnGhost: { background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnDanger: { background: "#fff", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 10, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  input: { width: "100%", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: "#0F172A", background: "#fff" },
  label: { display: "block", fontSize: 11.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  notice: { background: "#F0F9FF", border: "1px solid #BAE6FD", color: "#075985", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.6 },
  empty: { color: "#64748B", fontSize: 13.5, lineHeight: 1.7, margin: 0 },
  pillDraft: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" },
  pillLive: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" },
};

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 1080, margin: "0 auto", width: "100%" },
  bar: { display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid #E2E8F0", paddingBottom: 12, marginBottom: 22 },
  tab: { fontSize: 13, fontWeight: 600, color: "#64748B", textDecoration: "none", padding: "7px 13px", borderRadius: 999, border: "1px solid transparent" },
  on: { background: "#EEF2FF", color: "#4F46E5", borderColor: "#C7D2FE", fontWeight: 700 },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  h1: { margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: "#0F172A" },
  sub: { margin: "7px 0 0", fontSize: 13.5, color: "#64748B", lineHeight: 1.6, maxWidth: 620 },
};
