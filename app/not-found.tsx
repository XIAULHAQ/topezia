/**
 * The app-wide 404.
 *
 * There was none, so every notFound() fell through to Next's built-in page —
 * and served it with HTTP 200. A "page not found" body under a success status
 * is a soft 404: Google indexes the error content as if it were a real page,
 * which matters here because the whole /jobs SEO lattice calls notFound() for
 * slugs below the publish threshold.
 *
 * It also gives people somewhere to go, which the built-in page does not.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink, display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main style={S.wrap}>
        <div style={S.code}>404</div>
        <h1 style={S.h1}>We couldn&apos;t find that page</h1>
        <p style={S.sub}>
          The link may be out of date, or the role may have been filled and taken down. Both happen — job pages don&apos;t last forever.
        </p>
        <div style={S.actions}>
          <Link href="/jobs" style={S.primary}>Browse jobs</Link>
          <Link href="/portfolio" style={S.ghost}>See member work</Link>
          <Link href="/" style={S.ghost}>Go home</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { flex: 1, maxWidth: 620, margin: "0 auto", padding: "90px 24px", textAlign: "center" },
  code: { fontSize: 13, fontWeight: 800, letterSpacing: "1.5px", background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", marginBottom: 14 },
  h1: { margin: 0, fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 800, letterSpacing: "-0.8px" },
  sub: { margin: "14px 0 0", fontSize: 15, lineHeight: 1.7, color: C.mut },
  actions: { display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" },
  primary: { background: GRAD, color: "#fff", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 600, textDecoration: "none" },
  ghost: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 600, color: C.slate, textDecoration: "none" },
};
