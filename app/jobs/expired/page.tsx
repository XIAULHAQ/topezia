import Link from "next/link";
import type { CSSProperties } from "react";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

// Fail-soft landing when /go/{id} finds a job that's expired or dead (spec
// §4.4, §6.3) — better than sending the click to a broken external link.
export default function ExpiredJobPage() {
  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.brand}>topezia</div>
        <h1 style={S.h1}>That job just closed.</h1>
        <p style={S.p}>
          We verify listings aggressively, and this one went dead before you got there — sorry about
          that. It won&apos;t clutter your feed anymore.
        </p>
        <Link href="/feed" style={S.cta}>Back to my matches →</Link>
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
  cta: { display: "inline-block", padding: "13px 26px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: "none" },
};
