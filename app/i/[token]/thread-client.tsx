"use client";

/**
 * The reply surface behind the emailed thread link. Same quietness rules as
 * everywhere else: while the company hasn't replied (or has closed the
 * thread), the visitor sees "sent" and no reply box — never why.
 */
import { useState, type CSSProperties, type FormEvent } from "react";

type Msg = { id: string; sender: "COMPANY" | "CANDIDATE"; body: string; at: string };

export default function ThreadClient({
  token,
  companyName,
  firstMessage,
  sentAt,
  open,
  messages,
}: {
  token: string;
  companyName: string;
  firstMessage: string;
  sentAt: string;
  open: boolean;
  messages: Msg[];
}) {
  const [thread, setThread] = useState<Msg[]>(messages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/i/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: Msg & { createdAt?: string }; error?: string };
      if (!res.ok || !data.message) { setError(data.error ?? "Couldn't send that."); return; }
      setThread((cur) => [...cur, { id: data.message!.id, sender: "CANDIDATE", body: text.trim(), at: new Date().toISOString() }]);
      setText("");
    } catch {
      setError("Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={S.page}>
      <div style={S.card}>
        <h1 style={S.h1}>Your conversation with {companyName}</h1>
        <p style={S.sub}>
          Replies here go straight to their inbox. You&apos;ll get an email when they answer.
        </p>

        <div style={{ ...S.msg, ...S.mine }}>
          <span style={S.who}>You · {new Date(sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
          {firstMessage}
        </div>
        {thread.map((m) => (
          <div key={m.id} style={{ ...S.msg, ...(m.sender === "CANDIDATE" ? S.mine : S.theirs) }}>
            <span style={S.who}>
              {m.sender === "CANDIDATE" ? "You" : companyName} · {new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
            {m.body}
          </div>
        ))}

        {open ? (
          <form onSubmit={send} style={{ marginTop: 16 }}>
            <textarea
              style={S.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Reply to ${companyName}…`}
              maxLength={2000}
              required
            />
            {error && <p style={S.error}>{error}</p>}
            <button type="submit" style={S.btn} disabled={busy}>{busy ? "Sending…" : "Send reply"}</button>
          </form>
        ) : (
          <p style={{ ...S.sub, marginTop: 16 }}>
            {thread.length ? "This conversation is closed." : "Sent. If the team wants to talk, their reply lands in your email."}
          </p>
        )}
      </div>
      <p style={S.foot}>
        Private link — anyone holding it can read this page.{" "}
        <a href="https://www.topezia.com" style={{ color: "#4F46E5", fontWeight: 700, textDecoration: "none" }}>Topezia</a>
      </p>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", minHeight: "100vh", background: "#F8FAFC", padding: "40px 16px", color: "#0F172A" },
  card: { maxWidth: 560, margin: "0 auto", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: "24px 22px" },
  h1: { margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.3px" },
  sub: { margin: "8px 0 18px", fontSize: 13, lineHeight: 1.6, color: "#64748B" },
  msg: { fontSize: 13.5, lineHeight: 1.6, borderRadius: 12, padding: "10px 13px", whiteSpace: "pre-wrap", marginTop: 10 },
  mine: { background: "#EEF2FF", border: "1px solid #E0E7FF" },
  theirs: { background: "#F8FAFC", border: "1px solid #F1F5F9" },
  who: { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 },
  input: { width: "100%", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", minHeight: 84, resize: "vertical", boxSizing: "border-box" },
  btn: { marginTop: 10, background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, margin: "10px 0 0" },
  foot: { textAlign: "center", fontSize: 11.5, color: "#94A3B8", marginTop: 16 },
};
