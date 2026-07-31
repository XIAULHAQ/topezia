"use client";

/**
 * The contact form on a company's public page.
 *
 * Rendered only when the company turned contact on — the parent page decides
 * that from the ISR data, so this component never fetches config. It stays a
 * client island so /company/{slug} keeps its revalidate window: nothing here
 * is per-viewer until the moment of submission, and signed-in state is
 * discovered the honest way — by the API answering 401.
 */
import { useState, type CSSProperties, type FormEvent } from "react";

const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";
const MUTED = "#64748B";
const LINE = "#E2E8F0";

export default function ContactCard({
  companySlug,
  companyName,
  reasons,
  questions,
}: {
  companySlug: string;
  companyName: string;
  reasons: string[];
  questions: string[];
}) {
  const [openForm, setOpenForm] = useState(false);
  const [reason, setReason] = useState(reasons[0] ?? "");
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNeedsAuth(false);
    try {
      const res = await fetch(`/api/contact/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined, message, answers }),
      });
      if (res.status === 401) { setNeedsAuth(true); return; }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error ?? "That didn't go through — try again."); return; }
      setSent(true);
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section style={S.card}>
        <h3 style={S.h3}>Message sent</h3>
        <p style={S.p}>
          {companyName} has it in their inbox. If they want to talk, you&apos;ll get an
          email and the conversation opens on your Messages page.
        </p>
      </section>
    );
  }

  return (
    <section style={S.card}>
      <h3 style={S.h3}>Contact {companyName}</h3>
      {!openForm ? (
        <>
          <p style={S.p}>
            Send a message straight to their inbox. It goes with your Topezia
            profile attached, so they know who&apos;s writing.
          </p>
          <button type="button" style={S.btn} onClick={() => setOpenForm(true)}>
            Write a message
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {reasons.length > 0 && (
            <label style={S.field}>
              <span style={S.label}>Reason</span>
              <select style={S.input} value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          <label style={S.field}>
            <span style={S.label}>Your message</span>
            <textarea
              style={{ ...S.input, minHeight: 96, resize: "vertical" }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              placeholder={`Why you're reaching out to ${companyName}…`}
              required
            />
          </label>
          {questions.map((q) => (
            <label key={q} style={S.field}>
              <span style={S.label}>{q}</span>
              <input
                style={S.input}
                value={answers[q] ?? ""}
                onChange={(e) => setAnswers((cur) => ({ ...cur, [q]: e.target.value }))}
                maxLength={600}
              />
            </label>
          ))}
          {needsAuth && (
            <p style={S.notice}>
              Messages go with a profile attached — that&apos;s what keeps this inbox
              worth reading.{" "}
              <a href={`/login?next=/company/${companySlug}`} style={S.link}>Sign in</a> and
              your message is one click from sent.
            </p>
          )}
          {error && <p style={S.error}>{error}</p>}
          <button type="submit" style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy ? "Sending…" : "Send message"}
          </button>
          <p style={S.fine}>
            One message — they choose whether to open a conversation. No follow-ups
            until they reply.
          </p>
        </form>
      )}
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "20px 22px" },
  h3: { margin: "0 0 9px", fontSize: 14, fontWeight: 700 },
  p: { margin: "0 0 14px", fontSize: 12.3, lineHeight: 1.65, color: "#334155" },
  field: { display: "block", marginBottom: 12 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 },
  input: { width: "100%", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", color: "#0F172A", background: "#fff", boxSizing: "border-box" },
  btn: { display: "block", width: "100%", background: GRAD, color: "#fff", border: "none", borderRadius: 11, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  notice: { background: "#F0F9FF", border: "1px solid #BAE6FD", color: "#075985", borderRadius: 10, padding: "9px 12px", fontSize: 12.3, lineHeight: 1.6, margin: "0 0 12px" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "9px 12px", fontSize: 12.3, lineHeight: 1.5, margin: "0 0 12px" },
  link: { color: "#4F46E5", fontWeight: 700 },
  fine: { margin: "10px 0 0", fontSize: 11.3, lineHeight: 1.55, color: MUTED },
};
