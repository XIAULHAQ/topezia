"use client";

/**
 * The conversation inside the iframe.
 *
 * Two modes, one box. It starts as an AI assistant answering from the site.
 * When the visitor leaves a message, the session keeps the thread key (in
 * memory only — the email link is the durable way back in) and polls it, so
 * a company reply lands HERE while the tab is open, not just in email. The
 * moment a human has replied, the box belongs to the humans: further
 * visitor messages go to the thread, and the bot stays out of a
 * conversation two people are having.
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

type Product = { name: string; price: string | null; image: string | null; url: string };
type Turn = { role: "visitor" | "bot" | "team"; text: string; sources?: string[]; products?: Product[] };

const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";
const POLL_MS = 20_000;

export default function WidgetChat({
  token,
  companyName,
  logoUrl,
  ready,
  branded,
}: {
  token: string;
  companyName: string;
  logoUrl: string | null;
  ready: boolean;
  /** Free tier: show the Topezia attribution line. Paid turns it off. */
  branded: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "bot",
      text: ready
        ? `Hi — I'm the ${companyName} AI assistant. Ask me anything, or leave a message and a real person will get back to you.`
        : `Hi — I'm the ${companyName} AI assistant. I'm still learning this site, so for now let me take a message for the team.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [leadOpen, setLeadOpen] = useState(!ready);
  const [leadDone, setLeadDone] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [leadMsg, setLeadMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set once the visitor leaves a message; memory only, never persisted.
  const [threadToken, setThreadToken] = useState<string | null>(null);
  // True after a human replied — from then on the input feeds the thread.
  const [humanMode, setHumanMode] = useState(false);
  const seenMsgIds = useRef<Set<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, leadOpen, leadDone]);

  // Poll the thread while the tab is open so the company's reply appears in
  // the box the visitor is actually looking at.
  useEffect(() => {
    if (!threadToken) return;
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/i/${threadToken}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const data = (await res.json()) as { messages?: { id: string; sender: string; body: string }[] };
        const fresh = (data.messages ?? []).filter((m) => m.sender === "COMPANY" && !seenMsgIds.current.has(m.id));
        if (fresh.length) {
          fresh.forEach((m) => seenMsgIds.current.add(m.id));
          setTurns((cur) => [...cur, ...fresh.map((m) => ({ role: "team" as const, text: m.body }))]);
          setHumanMode(true);
        }
      } catch {
        /* next tick */
      }
    }
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(timer); };
  }, [threadToken]);

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
      if (humanMode && threadToken) {
        // A person is on the other end now — this goes to them, not the bot.
        const res = await fetch(`/api/i/${threadToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: { id: string }; error?: string };
        if (!res.ok || !data.message) {
          setTurns((cur) => [...cur, { role: "bot", text: data.error ?? "That didn't send — try again." }]);
          return;
        }
        seenMsgIds.current.add(data.message.id);
        return;
      }

      const res = await fetch(`/api/widget/${token}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: history.filter((t) => t.role !== "team").map(({ role, text: t }) => ({ role, text: t })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; sources?: string[]; products?: Product[]; handoff?: boolean; error?: string };
      if (!res.ok || !data.reply) {
        setTurns((cur) => [...cur, { role: "bot", text: data.error ?? "Something hiccuped — try that again." }]);
        return;
      }
      if (data.handoff && leadDone) {
        // The team already has their message — "leave your email" again
        // would be a dead end. Acknowledge and stay useful.
        setTurns((cur) => [
          ...cur,
          { role: "bot", text: "That one's for the team — and they already have your message, so they'll cover it when they reply. Anything else I can look up for you?" },
        ]);
        return;
      }
      setTurns((cur) => [...cur, { role: "bot", text: data.reply!, sources: data.sources, products: data.products }]);
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
          phone,
          message: leadMsg,
          transcript: turns.filter((t) => t.role !== "team").map(({ role, text }) => ({ role, text })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean; threadToken?: string; error?: string };
      if (!res.ok || !data.sent) {
        setError(data.error ?? "That didn't go through — try again.");
        return;
      }
      setLeadDone(true);
      setLeadOpen(false);
      if (data.threadToken) setThreadToken(data.threadToken);
      setTurns((cur) => [
        ...cur,
        { role: "bot", text: `Done — your message is with the ${companyName} team. If they reply while you're here, it shows up right in this chat; otherwise it lands at ${email}.` },
      ]);
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }

  const initials = companyName.trim().slice(0, 2).toUpperCase();

  return (
    <main style={S.page} className="tzw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header style={S.head}>
        <span style={S.avatar}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{initials}</span>
          )}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 14, display: "block" }}>{companyName}</b>
          <span style={S.headSub}>AI assistant · a person reads every message</span>
        </span>
        {/* Full-screen on phones hides the launcher bubble, so the chat has
            to carry its own way out. The parent page owns the iframe, hence
            postMessage rather than a local close. */}
        <button
          type="button"
          className="tzw-close"
          aria-label="Close chat"
          style={S.closeBtn}
          onClick={() => window.parent?.postMessage("topezia:close", "*")}
        >
          ✕
        </button>
      </header>

      <div ref={scroller} style={S.scroll}>
        {turns.map((t, i) => (
          <div
            key={i}
            style={{
              ...S.msg,
              ...(t.role === "visitor" ? S.msgVisitor : t.role === "team" ? S.msgTeam : S.msgBot),
            }}
          >
            {t.role === "team" && <span style={S.teamLabel}>{companyName} team</span>}
            {t.text}
            {t.products && t.products.length > 0 && (
              <span style={S.productList}>
                {t.products.map((p) => (
                  <a key={p.url + p.name} href={p.url} target="_top" style={S.productCard}>
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" style={S.productImg} />
                    )}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={S.productName}>{p.name}</b>
                      {p.price && <span style={S.productPrice}>{p.price}</span>}
                    </span>
                    <span style={S.productGo}>View →</span>
                  </a>
                ))}
              </span>
            )}
            {t.sources && t.sources.length > 0 && (
              <span style={S.sources}>
                {t.sources.map((u) => {
                  let label = u;
                  try {
                    const p = new URL(u).pathname;
                    label = !p || p === "/" ? "Home" : p;
                  } catch {}
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
            <input style={S.input} type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
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
          placeholder={humanMode ? `Reply to the ${companyName} team…` : ready ? "Ask a question…" : "Leave a message above…"}
          maxLength={1500}
          disabled={!ready && !leadDone && !humanMode}
        />
        <button type="submit" style={{ ...S.btn, padding: "10px 14px" }} disabled={busy || !input.trim() || (!ready && !leadDone && !humanMode)}>→</button>
      </form>

      {!leadOpen && !leadDone && (
        <button type="button" style={S.leaveLink} onClick={() => { setLeadMsg(""); setLeadOpen(true); }}>
          Leave a message instead
        </button>
      )}

      {/* The free tier's line, in HubSpot's shape: a real offer, not a
          watermark. Paid customers get nothing here at all — no branding,
          no "free", no trace. */}
      {branded && (
        <div style={S.poweredRow}>
          <a href="https://www.topezia.com/employer/widget" target="_blank" rel="noreferrer" style={S.poweredLink}>
            ⚡ Add AI chat to your site.
          </a>
          <span style={S.poweredMuted}>Free with Topezia.</span>
        </div>
      )}
    </main>
  );
}

/**
 * iOS Safari zooms the page whenever a focused input's text is under 16px,
 * and inside an iframe that zoom is stuck — the visitor ends up dragging a
 * magnified chat around. 16px on every field below tablet width is the only
 * reliable cure (user-scalable=no is ignored on modern iOS and would break
 * pinch-zoom for everyone else). Desktop keeps the tighter type.
 */
const CSS = `
.tzw-close{ display:none }
@media (max-width: 820px){
  .tzw input, .tzw textarea{ font-size:16px !important; }
}
@media (max-width: 640px){
  .tzw-close{ display:grid }
}
`;

const S: Record<string, CSSProperties> = {
  page: { fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#0F172A" },
  head: { padding: "12px 16px 10px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 },
  avatar: { flex: "none", width: 36, height: 36, borderRadius: 10, background: GRAD, display: "grid", placeItems: "center", overflow: "hidden", padding: 2 },
  headSub: { fontSize: 11, color: "#94A3B8" },
  closeBtn: { flex: "none", width: 34, height: 34, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", placeItems: "center", color: "#64748B", cursor: "pointer", fontSize: 15, fontFamily: "inherit" },
  scroll: { flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 },
  msg: { maxWidth: "85%", fontSize: 13.5, lineHeight: 1.55, borderRadius: 14, padding: "9px 13px", whiteSpace: "pre-wrap" },
  msgBot: { alignSelf: "flex-start", background: "#F1F5F9", color: "#0F172A", borderBottomLeftRadius: 4 },
  msgTeam: { alignSelf: "flex-start", background: "#fff", color: "#0F172A", border: "1.5px solid #C7D2FE", borderBottomLeftRadius: 4 },
  msgVisitor: { alignSelf: "flex-end", background: GRAD, color: "#fff", borderBottomRightRadius: 4 },
  teamLabel: { display: "block", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#4F46E5", marginBottom: 3 },
  productList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 10 },
  productCard: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "9px 11px", textDecoration: "none", color: "#0F172A", boxShadow: "0 1px 3px rgba(15,23,42,.06)" },
  productImg: { flex: "none", width: 44, height: 44, borderRadius: 8, objectFit: "cover", background: "#F1F5F9" },
  productName: { display: "block", fontSize: 12.8, fontWeight: 700, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" },
  productPrice: { display: "block", fontSize: 12, fontWeight: 800, color: "#4F46E5", marginTop: 2 },
  productGo: { flex: "none", fontSize: 11.5, fontWeight: 700, color: "#4F46E5" },
  sources: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  sourceLink: { fontSize: 11, color: "#4F46E5", fontWeight: 700, textDecoration: "none", background: "#EEF2FF", borderRadius: 999, padding: "2px 9px" },
  leadCard: { border: "1px solid #E2E8F0", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#F8FAFC" },
  input: { border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#0F172A", boxSizing: "border-box", width: "100%" },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px 6px", borderTop: "1px solid #E2E8F0" },
  btn: { background: GRAD, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  leaveLink: { background: "none", border: "none", color: "#64748B", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: "2px 0 0" },
  error: { color: "#B91C1C", fontSize: 12 },
  poweredRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap", borderTop: "1px solid #F1F5F9", padding: "8px 12px 10px", fontSize: 11.5 },
  poweredLink: { color: "#4F46E5", fontWeight: 700, textDecoration: "none" },
  poweredMuted: { color: "#94A3B8" },
};
