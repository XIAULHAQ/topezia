/**
 * Unsubscribe result page — presentational only. The actual unsubscribe happens
 * in /api/alerts/unsubscribe (which also serves RFC 8058 one-click POSTs).
 */
import Link from "next/link";
import type { CSSProperties } from "react";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function UnsubscribedPage({ searchParams }: { searchParams: { state?: string } }) {
  const ok = searchParams.state === "ok";
  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.brand}>topezia</div>
        <h1 style={S.h1}>{ok ? "You're unsubscribed." : "Link not recognized"}</h1>
        <p style={S.p}>
          {/* Don't promise a reply we can't receive: alerts send from a
              no-reply subdomain with no inbox behind it. */}
          {ok
            ? "We've stopped those alerts. No hard feelings — no more emails about it."
            : "That unsubscribe link is invalid or already used. If you're still getting emails you don't want, use the unsubscribe link at the bottom of the most recent one."}
        </p>
        <Link href="/" style={S.cta}>Back to Topezia</Link>
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "var(--font-jakarta), sans-serif", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { maxWidth: 460, textAlign: "center", background: "#fff", border: "1px solid #ececf2", borderRadius: 20, padding: "40px 32px" },
  brand: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, marginBottom: 20 },
  h1: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 26, margin: "0 0 12px" },
  p: { color: MUTED, fontSize: 16, lineHeight: 1.55, margin: "0 0 24px" },
  cta: { display: "inline-block", padding: "12px 24px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" },
};
