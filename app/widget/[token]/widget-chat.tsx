"use client";

/**
 * The conversation inside the iframe.
 *
 * Stateless on the server: the full visible history rides with every chat
 * request, and nothing is stored until the visitor leaves their email — at
 * which point the transcript becomes part of a CompanyInquiry and the
 * company answers from their Topezia inbox. The little "answers come from
 * this site" line and the powered-by link are honesty, not chrome: visitors
 * should know what they're talking to and where a reply will come from.
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

type Turn = { role: "visitor" | "bot"; text: string; sources?: string[] };

const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";

export default function WidgetChat({ token, companyName, ready }: { token: string; companyName: string; ready: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "bot",
      text: ready
        ? `Hi — ask me anything about ${companyName}. I answer from what's on this site, and you can always leave a message for the team.`
        : `Hi — I'm still reading this site, so for now the best I can do is take a message for the ${companyName} team.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [leadOpen, setLeadOpen] = useState(!ready);
  const [leadDone, setLeadDone] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [leadMsg, setLeadMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, leadOpen, leadDone]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    const history = [...turns, { role: "visitor" as const, text }];
    setTurns(history);
    setBusy(true);
    try {
      const res = await fetch(`/api/widget/${token}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.map(({ role, text: t }) => ({ role, text: t })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; sources?: string[]; handoff?: boolean; error?: string };
      if (!res.ok || !data.reply) {
        setTurns((cur) => [...cur, { role: "bot", text: data.error ?? "Something hiccuped — try that again." }]);
        return;
      }
      setTurns((cur) => [...cur, { role: "bot", text: data.reply!, sources: data.sources }]);
      if (data.handoff) {
        setLeadMsg(text);
        setLeadOpen(true);
      }
    } catch {
      setTurns((cur) => [...cur, { role: "bot", text: "Something hiccuped — try that again." }]);
    } finally {
      setBusy(false);
    }
  }

  async function sendLead(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/widget/${token}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          message: leadMsg,
          transcript: turns.map(({ role, text }) => ({ role, text })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean; error?: string };
      if (!res.ok || !data.sent) {
        setError(data.error ?? "That didn't go through — try again.");
        return;
      }
      setLeadDone(true);
      setLeadOpen(false);
      setTurns((cur) => [...cur, { role: "bot", text: `Done — your message is with the ${companyName} team. The reply will land at ${email}.` }]);
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={S.page}>
      <header style={S.head}>
        <b style={{ fontSize: 14 }}>{companyName}</b>
        <span style={S.headSub}>Answers come from this website · a person reads every message</span>
      </header>

      <div ref={scroller} style={S.scroll}>
        {turns.map((t, i) => (
          <div key={i} style={{ ...S.msg, ...(t.role === "visitor" ? S.msgVisitor : S.msgBot) }}>
            {t.text}
            {t.sources && t.sources.length > 0 && (
              <span style={S.sources}>
                {t.sources.map((u) => {
                  let label = u;
                  try { label = new URL(u).pathname || "/"; } catch {}
                  return (
                    <a key={u} href={u} target="_top" style={S.sourceLink}>{label}</a>
                  );
                })}
              </span>
            )}
          </div>
        ))}
        {busy && !leadOpen && <div style={{ ...S.msg, ...S.msgBot, color: "#94A3B8" }}>…</div>}

        {leadOpen && !leadDone && (
          <form onSubmit={sendLead} style={S.leadCard}>
            <b style={{ fontSize: 13 }}>Leave a message for the team</b>
            <input style={S.input} type="text" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <input style={S.input} type="email" placeholder="Email — the reply goes here" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
            <textarea style={{ ...S.input, minHeight: 64, resize: "vertical" }} placeholder="What do you need?" value={leadMsg} onChange={(e) => setLeadMsg(e.target.value)} required maxLength={2000} />
            {error && <span style={S.error}>{error}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={S.btn} disabled={busy}>{busy ? "Sending…" : "Send to the team"}</button>
              {ready && (
                <button type="button" style={S.btnGhost} onClick={() => setLeadOpen(false)}>Keep chatting</button>
              )}
            </div>
          </form>
        )}
      </div>

      <form onSubmit={send} style={S.inputRow}>
        <input
          style={{ ...S.input, flex: 1, margin: 0 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ready ? "Ask a question…" : "Leave a message above…"}
          maxLength={1500}
          disabled={!ready && !leadDone}
        />
        <button type="submit" style={{ ...S.btn, padding: "10px 14px" }} disabled={busy || !input.trim() || (!ready && !leadDone)}>→</button>
      </form>

      {!leadOpen && !leadDone && (
        <button type="button" style={S.leaveLink} onClick={() => { setLeadMsg(""); setLeadOpen(true); }}>
          Leave a message instead
        </button>
      )}

      <a href="https://www.topezia.com" target="_blank" rel="noreferrer" style={S.powered}>
        ⚡ Powered by Topezia
      </a>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#0F172A" },
  head: { padding: "14px 16px 10px", borderBottom: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 2 },
  headSub: { fontSize: 11, color: "#94A3B8" },
  scroll: { flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 },
  msg: { maxWidth: "85%", fontSize: 13.5, lineHeight: 1.55, borderRadius: 14, padding: "9px 13px", whiteSpace: "pre-wrap" },
  msgBot: { alignSelf: "flex-start", background: "#F1F5F9", color: "#0F172A", borderBottomLeftRadius: 4 },
  msgVisitor: { alignSelf: "flex-end", background: GRAD, color: "#fff", borderBottomRightRadius: 4 },
  sources: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  sourceLink: { fontSize: 11, color: "#4F46E5", fontWeight: 700, textDecoration: "none", background: "#EEF2FF", borderRadius: 999, padding: "2px 9px" },
  leadCard: { border: "1px solid #E2E8F0", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#F8FAFC" },
  input: { border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#0F172A", boxSizing: "border-box", width: "100%" },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px 6px", borderTop: "1px solid #E2E8F0" },
  btn: { background: GRAD, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  leaveLink: { background: "none", border: "none", color: "#64748B", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: "2px 0 0" },
  error: { color: "#B91C1C", fontSize: 12 },
  powered: { textAlign: "center", fontSize: 10.5, color: "#94A3B8", textDecoration: "none", padding: "6px 0 8px" },
};
