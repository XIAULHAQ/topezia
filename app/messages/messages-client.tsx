"use client";

/**
 * The member's side of company contact.
 *
 * Deliberately quiet about what happened on the other end: a message shows
 * "Sent" until the company replies, whether it's sitting unread, archived, or
 * marked spam — no read receipts, no "seen", and no way to tell those apart.
 * A reply box exists only while the conversation is open (the company replied
 * and hasn't closed it). See /api/inquiries for the mapping.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, FONT } from "@/app/_components/ui";
import { companyLogoUrl } from "@/lib/company/storage";
import { INQUIRY_LIMITS } from "@/lib/company/inquiries";

type Msg = { id: string; sender: "COMPANY" | "CANDIDATE"; body: string; createdAt: string };
type Row = {
  id: string;
  reason: string | null;
  message: string;
  answers: { question: string; answer: string }[] | null;
  replied: boolean;
  open: boolean;
  repliedAt: string | null;
  createdAt: string;
  company: { name: string; slug: string; logoPath: string | null };
  messages: Msg[];
};

export default function MessagesClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [authGate, setAuthGate] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Same liveness rule as the employer inbox: a conversation page that
  // fetches once shows yesterday. Poll while visible, refetch on focus;
  // wholesale replacement is safe (optimistic appends carry real ids).
  useEffect(() => {
    let stop = false;
    async function load(first: boolean) {
      try {
        const r = await fetch("/api/inquiries", { cache: "no-store" });
        if (stop) return;
        if (r.status === 401 || r.status === 409) { setAuthGate(true); setRows([]); return; }
        const d = r.ok ? await r.json() : null;
        if (stop || !d) { if (first && !d) setRows([]); return; }
        setRows(d.inquiries ?? []);
      } catch {
        if (first) setRows([]);
      }
    }
    load(true);
    const timer = setInterval(() => { if (!document.hidden) load(false); }, 20_000);
    const onFocus = () => load(false);
    window.addEventListener("focus", onFocus);
    return () => { stop = true; clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  async function sendReply(row: Row) {
    if (replyBusy || !replyText.trim()) return;
    setReplyBusy(true); setReplyError(null);
    try {
      const res = await fetch(`/api/inquiries/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: Msg; error?: string };
      if (!res.ok || !data.message) { setReplyError(data.error ?? "Couldn't send that."); return; }
      const msg = data.message;
      setRows((cur) => (cur ?? []).map((x) => (x.id === row.id ? { ...x, messages: [...x.messages, msg] } : x)));
      setReplyFor(null); setReplyText("");
    } catch {
      setReplyError("Couldn't send that.");
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, fontFamily: FONT }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: "0 0 4px" }}>Messages</h1>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
        Companies you&apos;ve written to through their contact form. One message each — if they
        want to talk, they reply and the conversation opens here.
      </p>

      {rows === null && <p style={{ color: C.mut, fontSize: 14 }}>Loading…</p>}
      {rows !== null && authGate && (
        <div style={S.empty}>
          <Link href="/login?next=/messages" style={{ color: "#4F46E5", fontWeight: 700 }}>Sign in</Link> to see
          your messages.
        </div>
      )}
      {rows !== null && !authGate && rows.length === 0 && (
        <div style={S.empty}>
          Nothing yet. Company pages with a <b>Contact</b> card take messages — what you send
          shows up here.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(rows ?? []).map((row) => {
          const logo = companyLogoUrl(row.company.logoPath);
          const closed = row.replied && !row.open;
          return (
            <div key={row.id} style={S.card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" style={S.logo} />
                )}
                <Link href={`/company/${row.company.slug}`} style={S.company}>{row.company.name}</Link>
                {row.reason && <span style={S.reasonPill}>{row.reason}</span>}
                <span style={row.open ? S.pillOpen : closed ? S.pillClosed : S.pillSent}>
                  {row.open ? "Replied" : closed ? "Conversation closed" : "Sent"}
                </span>
                <span style={S.meta}>
                  {new Date(row.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>

              <p style={S.body}>{row.message}</p>
              {(row.answers ?? []).map((a) => (
                <p key={a.question} style={S.answer}>
                  <b style={{ color: "#475569" }}>{a.question}</b> — {a.answer}
                </p>
              ))}

              {row.messages.length > 0 && (
                <div style={S.thread}>
                  {row.messages.map((m) => (
                    <div key={m.id} style={{ ...S.msg, ...(m.sender === "CANDIDATE" ? S.msgMine : {}) }}>
                      <span style={S.msgWho}>{m.sender === "CANDIDATE" ? "You" : row.company.name}</span>
                      {m.body}
                    </div>
                  ))}
                </div>
              )}

              {row.open && (
                replyFor === row.id ? (
                  <div style={{ marginTop: 12 }}>
                    <textarea
                      style={S.input}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={INQUIRY_LIMITS.reply}
                      placeholder={`Reply to ${row.company.name}…`}
                      autoFocus
                    />
                    {replyError && <p style={S.error}>{replyError}</p>}
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <button type="button" style={S.btn} disabled={replyBusy} onClick={() => sendReply(row)}>
                        {replyBusy ? "Sending…" : "Send"}
                      </button>
                      <button type="button" style={S.btnGhost} onClick={() => { setReplyFor(null); setReplyError(null); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <button type="button" style={S.btnGhost} onClick={() => { setReplyFor(row.id); setReplyText(""); setReplyError(null); }}>
                      Reply
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" },
  empty: { border: `1px dashed ${C.line}`, borderRadius: 14, padding: "26px 22px", color: C.mut, fontSize: 13.5, lineHeight: 1.6, background: "#fff" },
  logo: { width: 26, height: 26, borderRadius: 7, objectFit: "contain", border: `1px solid ${C.line}`, background: "#fff", padding: 2 },
  company: { fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: "none" },
  reasonPill: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#EEF2FF", color: "#4F46E5", border: "1px solid #C7D2FE" },
  pillSent: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#F1F5F9", color: "#64748B" },
  pillOpen: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#ECFDF5", color: "#047857" },
  pillClosed: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#F3F4F6", color: "#6b7280" },
  meta: { fontSize: 11.5, color: "#94A3B8", marginLeft: "auto" },
  body: { margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.65, color: "#334155", whiteSpace: "pre-wrap" },
  answer: { margin: "7px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.mut },
  thread: { marginTop: 13, borderTop: "1px solid #F1F5F9", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  msg: { fontSize: 13, lineHeight: 1.6, color: "#334155", background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 10, padding: "9px 12px", whiteSpace: "pre-wrap" },
  msgMine: { background: "#EEF2FF", borderColor: "#E0E7FF" },
  msgWho: { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#94A3B8", marginBottom: 3 },
  input: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: C.ink, background: "#fff", minHeight: 80, resize: "vertical", boxSizing: "border-box" },
  btn: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#fff", color: "#334155", border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, margin: "10px 0 0" },
};
