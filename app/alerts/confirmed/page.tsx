/**
 * Double opt-in confirmation result page. The work happens in
 * /api/alerts/confirm; this just tells the human what happened.
 */
import Link from "next/link";
import type { CSSProperties } from "react";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function AlertConfirmedPage({ searchParams }: { searchParams: { state?: string } }) {
  const ok = searchParams.state === "ok";
  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.brand}>topezia</div>
        <h1 style={S.h1}>{ok ? "Alert confirmed." : "Link not recognized"}</h1>
        <p style={S.p}>
          {ok
            ? "We'll email you when new matching jobs show up — and nothing when they don't. Unsubscribe from any email in one click."
            : "That confirmation link is invalid or expired. Sign up again from any jobs page and we'll send a fresh one."}
        </p>
        <Link href={ok ? "/onboard" : "/"} style={S.cta}>
          {ok ? "See which ones fit me →" : "Back to Topezia"}
        </Link>
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { maxWidth: 460, textAlign: "center", background: "#fff", border: "1px solid #ececf2", borderRadius: 20, padding: "40px 32px" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, marginBottom: 20 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, margin: "0 0 12px" },
  p: { color: MUTED, fontSize: 16, lineHeight: 1.55, margin: "0 0 24px" },
  cta: { display: "inline-block", padding: "12px 24px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" },
};
