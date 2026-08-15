/**
 * Where "turn off connection emails" lands. Presentational only — the flip
 * happens in /api/network/notify-unsubscribe.
 *
 * The copy is careful to say what was NOT turned off. A member who clicks an
 * unsubscribe link and then wonders whether they just lost their job alerts has
 * been given a worse experience than one who never clicked.
 */
import Link from "next/link";
import type { CSSProperties } from "react";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export const metadata = { title: "Connection emails off — Topezia", robots: { index: false } };

export default function NotificationsOffPage({ searchParams }: { searchParams: { state?: string } }) {
  const ok = searchParams.state === "ok";
  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.brand}>topezia</div>
        <h1 style={S.h1}>{ok ? "Connection emails are off." : "Link not recognized"}</h1>
        <p style={S.p}>
          {ok
            ? "We won't email you about connection requests or acceptances again. Both still show on your network page whenever you look. Your job alerts and other emails are unaffected."
            : "That link is invalid or already used. You can change this any time under Settings."}
        </p>
        <Link href={ok ? "/network" : "/settings"} style={S.cta}>
          {ok ? "See your network" : "Open settings"}
        </Link>
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
