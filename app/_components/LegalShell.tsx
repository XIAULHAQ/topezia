/**
 * Shared chrome for the legal/compliance pages (/privacy, /terms, /cookies).
 * Plain, readable, indexable. Content lives in each page.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "'Sora', system-ui, sans-serif";

export default function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink }}>
      <header style={{ borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", gap: 9 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: C.ink, textDecoration: "none" }}>
            <svg width="32" height="24" viewBox="0 0 36 26" aria-hidden><defs><linearGradient id="lgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs><circle cx="10.5" cy="13" r="7.2" stroke="url(#lgb)" strokeWidth="4.2" fill="none" /><circle cx="25.5" cy="13" r="7.2" stroke="url(#lgb)" strokeWidth="4.2" fill="none" /></svg>
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px", margin: "0 0 6px" }}>{title}</h1>
        <p style={{ color: C.mut, fontSize: 13.5, margin: "0 0 8px" }}>Last updated: {updated}</p>
        <div style={S.notice}>
          This document is a plain-language policy for Topezia. It is provided for transparency and is not legal advice.
        </div>
        <div style={S.legal}>{children}</div>

        <nav style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 48, paddingTop: 20, borderTop: `1px solid ${C.line}`, fontSize: 13, fontWeight: 600 }}>
          <Link href="/privacy" style={S.link}>Privacy Policy</Link>
          <Link href="/terms" style={S.link}>Terms of Service</Link>
          <Link href="/cookies" style={S.link}>Cookie Policy</Link>
          <Link href="/" style={S.link}>Home</Link>
        </nav>
      </main>
    </div>
  );
}

// Small typographic helpers so each page reads consistently.
export function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", margin: "34px 0 10px" }}>{children}</h2>;
}
export function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 15, lineHeight: 1.7, color: C.slate, margin: "0 0 14px" }}>{children}</p>;
}
export function UL({ children }: { children: ReactNode }) {
  return <ul style={{ margin: "0 0 14px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>{children}</ul>;
}
export function LI({ children }: { children: ReactNode }) {
  return <li style={{ fontSize: 15, lineHeight: 1.65, color: C.slate }}>{children}</li>;
}
export const Placeholder = ({ children }: { children: ReactNode }) => (
  <span style={{ background: "#FEF3C7", color: "#92400E", padding: "1px 6px", borderRadius: 5, fontWeight: 600, fontSize: 14 }}>{children}</span>
);

const S: Record<string, CSSProperties> = {
  notice: { background: "#F8FAFC", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px", fontSize: 13, color: C.mut, lineHeight: 1.55, margin: "16px 0 8px" },
  legal: { marginTop: 8 },
  link: { color: C.c1, textDecoration: "none" },
};

export { GRAD };
