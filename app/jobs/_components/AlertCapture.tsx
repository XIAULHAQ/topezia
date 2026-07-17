"use client";

/**
 * Above-the-fold email-alert capture (spec §7 page anatomy).
 * Posts the page's slug/state; the API resolves the saved search server-side.
 */
import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function AlertCapture({ slug, state, label }: { slug: string; state?: string; label: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, slug, state: state ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "done") {
    return (
      <div style={S.wrap}>
        <div style={S.doneTitle}>✓ Check your email to confirm</div>
        <div style={S.sub}>
          We sent you a one-click confirmation link. We won&apos;t email you {label.toLowerCase()} until you click it —
          and you can unsubscribe from any email, one click.
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>Get new {label.toLowerCase()} by email</div>
      <div style={S.sub}>Fresh, verified postings — no digest spam, and one-click unsubscribe.</div>
      <form style={S.form} onSubmit={submit}>
        <input
          style={S.input}
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
        />
        <button style={btn(status === "saving")} type="submit" disabled={status === "saving"}>
          {status === "saving" ? "…" : "Email me new jobs"}
        </button>
      </form>
      {message && <div style={S.error}>{message}</div>}
    </div>
  );
}

const btn = (busy: boolean): CSSProperties => ({
  padding: "12px 20px", background: busy ? "#c7c7d1" : INDIGO, color: "#fff", border: "none",
  borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer",
  fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
});

const S: Record<string, CSSProperties> = {
  wrap: { background: "#eef0ff", border: "1px solid #d9dcff", borderRadius: 16, padding: 20, marginBottom: 28 },
  title: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 4, color: INK },
  doneTitle: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 4, color: "#059669" },
  sub: { color: MUTED, fontSize: 14, lineHeight: 1.45, marginBottom: 12 },
  form: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: { flex: 1, minWidth: 200, padding: "11px 13px", fontSize: 15, borderRadius: 10, border: "1px solid #d9dcff", fontFamily: "'Plus Jakarta Sans', sans-serif" },
  error: { color: "#dc2626", fontSize: 13, marginTop: 8 },
};
