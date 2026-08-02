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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { T, pickLocale } from "./strings";

type BuyOption = { label: string; price: string; url: string };
type Product = { name: string; price: string | null; image: string | null; url: string; buy?: BuyOption[] };
type Turn = { role: "visitor" | "bot" | "team"; text: string; sources?: string[]; products?: Product[] };

const DEFAULT_GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";
const POLL_MS = 20_000;

/** Chrome's SpeechRecognition, under either name. Absent everywhere else. */
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export default function WidgetChat({
  token,
  companyName,
  logoUrl,
  ready,
  branded,
  greeting,
  pageUrl,
  badgeKind,
  accent,
  replyTime,
  offline,
  offlineUntil,
}: {
  token: string;
  companyName: string;
  logoUrl: string | null;
  ready: boolean;
  /** Show an attribution line at all. */
  branded: boolean;
  /** Which line: the free tier's offer, or a paying customer's credit.
   *  "Free with Topezia" would be a lie under someone paying us. */
  badgeKind: "free" | "credit";
  /** Page-aware opener computed server-side; null = the default hello. */
  greeting: string | null;
  /** The host page the visitor opened the chat from, for retrieval. */
  pageUrl: string | null;
  /** The company's brand colour (#rrggbb), or null for Topezia's gradient. */
  accent: string | null;
  /** Measured from this company's real replies; null when unknown. */
  replyTime: string | null;
  /** Outside the owner's stated hours — say so rather than imply presence. */
  offline: boolean;
  offlineUntil: string | null;
}) {
  // The visitor's browser language drives the chrome; the assistant's own
  // replies follow whatever language they type in (a prompt rule server-side).
  const [locale, setLocale] = useState("en");
  useEffect(() => { setLocale(pickLocale(navigator.language)); }, []);
  const t = T(locale);

  const grad = useMemo(() => {
    if (!accent) return DEFAULT_GRAD;
    const n = parseInt(accent.slice(1), 16);
    const sh = (c: number) => Math.max(0, Math.round(c * 0.72));
    const hx = (c: number) => c.toString(16).padStart(2, "0");
    return `linear-gradient(135deg,${accent},#${hx(sh((n >> 16) & 255))}${hx(sh((n >> 8) & 255))}${hx(sh(n & 255))})`;
  }, [accent]);
  const ink = accent ?? "#4F46E5";

  const [turns, setTurns] = useState<Turn[]>([
    { role: "bot", text: !ready ? t.hiLearning(companyName) : greeting ?? t.hiReady(companyName) },
  ]);
  // The opener is seeded before the locale is known (it renders on the
  // server); once it is, translate our own default — but never the
  // server-computed greeting, which quotes the site's own words.
  useEffect(() => {
    if (greeting) return;
    setTurns((cur) =>
      cur.length === 1 && cur[0].role === "bot"
        ? [{ role: "bot", text: !ready ? t.hiLearning(companyName) : t.hiReady(companyName) }]
        : cur
    );
  }, [locale, greeting, ready, companyName, t]);
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

  // ── Voice input ────────────────────────────────────────────────────────
  // Browser-native speech recognition: no upload, no model of ours, no cost.
  // It exists in Chrome and Safari and nowhere else, so the button only
  // appears where it works — a mic that does nothing is worse than no mic.
  const [micOn, setMicOn] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  // A mic that fails silently reads as a broken button. Say what happened.
  const [micNote, setMicNote] = useState<string | null>(null);
  const recognizer = useRef<SpeechRec | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setMicAvailable(true);
    return () => { try { recognizer.current?.stop(); } catch { /* already stopped */ } };
  }, []);

  function toggleMic() {
    if (micOn) {
      try { recognizer.current?.stop(); } catch { /* already stopped */ }
      setMicOn(false);
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    // Dictation lands in the box; the visitor still presses send. Nothing
    // is transmitted on their behalf because they held a button down.
    rec.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setInput(said);
    };
    rec.onerror = (e) => {
      setMicOn(false);
      // "no-speech" and "aborted" are ordinary — the visitor said nothing or
      // changed their mind, and a warning for that would be noise.
      const code = e?.error;
      if (code === "no-speech" || code === "aborted") return;
      setMicNote(code === "not-allowed" || code === "service-not-allowed" ? t.micBlocked : t.micFailed);
    };
    rec.onend = () => setMicOn(false);
    recognizer.current = rec;
    try {
      rec.start();
      setMicOn(true);
      setMicNote(null);
    } catch {
      setMicOn(false);
      setMicNote(t.micFailed);
    }
  }

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
          page: pageUrl ?? undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setTurns((cur) => [...cur, { role: "bot", text: data.error ?? "Something hiccuped — try that again." }]);
        return;
      }

      // The reply STREAMS as NDJSON events: grow one bot bubble delta by
      // delta, then finish it with the done event's metadata. The done event
      // carries the full reply too, which covers fallback paths that never
      // streamed a delta.
      setTurns((cur) => [...cur, { role: "bot", text: "" }]);
      const patchLast = (patch: Partial<Turn>) =>
        setTurns((cur) => cur.map((t, i) => (i === cur.length - 1 ? { ...t, ...patch } : t)));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      type DoneEvent = { reply?: string; sources?: string[]; products?: Product[]; handoff?: boolean };
      let done: DoneEvent | null = null;
      for (;;) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as { t: string; text?: string } & DoneEvent;
            if (ev.t === "delta" && ev.text) {
              acc += ev.text;
              patchLast({ text: acc });
            } else if (ev.t === "done") {
              done = ev;
            }
          } catch { /* partial line — next read completes it */ }
        }
      }

      const finalText = acc || done?.reply || "Something hiccuped — try that again.";
      if (done?.handoff && leadDone) {
        // The team already has their message — "leave your email" again
        // would be a dead end. Acknowledge and stay useful.
        patchLast({ text: "That one's for the team — and they already have your message, so they'll cover it when they reply. Anything else I can look up for you?" });
        return;
      }
      patchLast({ text: finalText, sources: done?.sources, products: done?.products });
      if (done?.handoff) {
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
        setError(data.error ?? t.failed);
        return;
      }
      setLeadDone(true);
      setLeadOpen(false);
      if (data.threadToken) setThreadToken(data.threadToken);
      setTurns((cur) => [...cur, { role: "bot", text: t.sent(companyName, email) }]);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const initials = companyName.trim().slice(0, 2).toUpperCase();

  return (
    <main style={S.page} className="tzw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header style={S.head}>
        <span style={{ ...S.avatar, background: grad }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{initials}</span>
          )}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 14, display: "block" }}>{companyName}</b>
          {/* Availability is stated only when it's been earned: a measured
              reply time, or hours the owner actually set. Otherwise the
              honest thing to say is what the assistant is. */}
          <span style={S.headSub}>
            {offline
              ? offlineUntil ? t.offline(offlineUntil) : t.offlineNoTime
              : replyTime ?? t.aiSub}
          </span>
        </span>
        {/* Full-screen on phones hides the launcher bubble, so the chat has
            to carry its own way out. The parent page owns the iframe, hence
            postMessage rather than a local close. */}
        <button
          type="button"
          className="tzw-close"
          aria-label={t.close}
          style={S.closeBtn}
          onClick={() => window.parent?.postMessage("topezia:close", "*")}
        >
          ✕
        </button>
      </header>

      <div ref={scroller} style={S.scroll}>
        {turns.map((turn, i) => (
          <div
            key={i}
            style={{
              ...S.msg,
              ...(turn.role === "visitor"
                ? { ...S.msgVisitor, background: grad }
                : turn.role === "team"
                  ? { ...S.msgTeam, borderColor: ink }
                  : S.msgBot),
            }}
          >
            {turn.role === "team" && <span style={{ ...S.teamLabel, color: ink }}>{t.teamLabel(companyName)}</span>}
            {turn.text || "…"}
            {turn.products && turn.products.length > 0 && (
              <span style={S.productList}>
                {turn.products.map((p) => (
                  <a key={p.url + p.name} href={p.url} target="_top" style={S.productCard}>
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" style={S.productImg} />
                    )}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={S.productName}>{p.name}</b>
                      {p.price && <span style={{ ...S.productPrice, color: ink }}>{p.price}</span>}
                    </span>
                    <span style={{ ...S.productGo, color: ink }}>View →</span>
                  </a>
                ))}
                {/* Straight into the store's own checkout, item already in
                    the basket. target="_top" because the merchant's cart
                    cookie belongs to their page, not to this iframe — and
                    paying inside a frame is something no one should do. */}
                {turn.products.map((p) =>
                  (p.buy ?? []).length === 0 ? null : (
                    <span key={`buy-${p.url}`} style={S.buyRow}>
                      {(p.buy ?? []).map((b) => (
                        <a key={b.url} href={b.url} target="_top" style={{ ...S.buyBtn, background: grad }}>
                          {b.label}{b.price ? ` · ${b.price}` : ""}
                        </a>
                      ))}
                    </span>
                  )
                )}
              </span>
            )}
            {turn.sources && turn.sources.length > 0 && (
              <span style={S.sources}>
                {turn.sources.map((u) => {
                  let label = u;
                  try {
                    const p = new URL(u).pathname;
                    label = !p || p === "/" ? "Home" : p;
                  } catch {}
                  return (
                    <a key={u} href={u} target="_top" style={{ ...S.sourceLink, color: ink }}>{label}</a>
                  );
                })}
              </span>
            )}
          </div>
        ))}
        {/* Thinking dots only until the first streamed word arrives. */}
        {busy && !leadOpen && turns.at(-1)?.role === "visitor" && <div style={{ ...S.msg, ...S.msgBot, color: "#94A3B8" }}>…</div>}

        {leadOpen && !leadDone && (
          <form onSubmit={sendLead} style={S.leadCard}>
            <b style={{ fontSize: 13 }}>{t.leadTitle}</b>
            {/* Expectation-setting exactly where it matters: the moment
                someone hands over their email. Both lines are real — a
                measured median, or hours the owner set. */}
            {(offline || replyTime) && (
              <span style={S.leadNote}>
                {offline ? (offlineUntil ? t.offline(offlineUntil) : t.offlineNoTime) : replyTime}
              </span>
            )}
            <input style={S.input} type="text" placeholder={t.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <input style={S.input} type="email" placeholder={t.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
            <input style={S.input} type="tel" placeholder={t.phonePlaceholder} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            <textarea style={{ ...S.input, minHeight: 64, resize: "vertical" }} placeholder={t.needPlaceholder} value={leadMsg} onChange={(e) => setLeadMsg(e.target.value)} required maxLength={2000} />
            {error && <span style={S.error}>{error}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={{ ...S.btn, background: grad }} disabled={busy}>{busy ? t.sending : t.sendToTeam}</button>
              {ready && (
                <button type="button" style={S.btnGhost} onClick={() => setLeadOpen(false)}>{t.keepChatting}</button>
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
          placeholder={micOn ? t.listening : humanMode ? t.replyPlaceholder(companyName) : ready ? t.askPlaceholder : t.leadTitle}
          maxLength={1500}
          disabled={!ready && !leadDone && !humanMode}
        />
        {/* Only rendered where the browser actually supports dictation. */}
        {micAvailable && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micOn ? t.listening : t.listen}
            title={micOn ? t.listening : t.listen}
            style={{ ...S.micBtn, ...(micOn ? { background: grad, color: "#fff", borderColor: "transparent" } : null) }}
            disabled={!ready && !leadDone && !humanMode}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button type="submit" style={{ ...S.btn, padding: "10px 14px", background: grad }} disabled={busy || !input.trim() || (!ready && !leadDone && !humanMode)} aria-label={t.send}>→</button>
      </form>

      {micNote && (
        <span style={S.micNote} role="status">{micNote}</span>
      )}

      {!leadOpen && !leadDone && (
        <button type="button" style={S.leaveLink} onClick={() => { setLeadMsg(""); setLeadOpen(true); }}>
          {t.leaveInstead}
        </button>
      )}

      {/* Three states. The free tier carries a real offer, in HubSpot's
          shape — not a watermark. A paying company that took the discount
          carries a plain credit, because "Free with Topezia" under someone
          who pays us would be a lie. Everyone else carries nothing. */}
      {branded && (
        <div style={S.poweredRow}>
          {badgeKind === "free" ? (
            <>
              <a href="https://www.topezia.com/pricing/business" target="_blank" rel="noreferrer" style={S.poweredLink}>
                ⚡ Add AI chat to your site.
              </a>
              <span style={S.poweredMuted}>Free with Topezia.</span>
            </>
          ) : (
            <a href="https://www.topezia.com/pricing/business" target="_blank" rel="noreferrer" style={S.poweredMuted}>
              AI chat powered by <span style={S.poweredLink}>Topezia</span>
            </a>
          )}
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
  avatar: { flex: "none", width: 36, height: 36, borderRadius: 10, background: DEFAULT_GRAD, display: "grid", placeItems: "center", overflow: "hidden", padding: 2 },
  headSub: { fontSize: 11, color: "#94A3B8" },
  closeBtn: { flex: "none", width: 34, height: 34, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", placeItems: "center", color: "#64748B", cursor: "pointer", fontSize: 15, fontFamily: "inherit" },
  scroll: { flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 },
  msg: { maxWidth: "85%", fontSize: 13.5, lineHeight: 1.55, borderRadius: 14, padding: "9px 13px", whiteSpace: "pre-wrap" },
  msgBot: { alignSelf: "flex-start", background: "#F1F5F9", color: "#0F172A", borderBottomLeftRadius: 4 },
  msgTeam: { alignSelf: "flex-start", background: "#fff", color: "#0F172A", border: "1.5px solid #C7D2FE", borderBottomLeftRadius: 4 },
  msgVisitor: { alignSelf: "flex-end", background: DEFAULT_GRAD, color: "#fff", borderBottomRightRadius: 4 },
  teamLabel: { display: "block", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#4F46E5", marginBottom: 3 },
  productList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 10 },
  productCard: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "9px 11px", textDecoration: "none", color: "#0F172A", boxShadow: "0 1px 3px rgba(15,23,42,.06)" },
  productImg: { flex: "none", width: 44, height: 44, borderRadius: 8, objectFit: "cover", background: "#F1F5F9" },
  productName: { display: "block", fontSize: 12.8, fontWeight: 700, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" },
  productPrice: { display: "block", fontSize: 12, fontWeight: 800, color: "#4F46E5", marginTop: 2 },
  productGo: { flex: "none", fontSize: 11.5, fontWeight: 700, color: "#4F46E5" },
  buyRow: { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 },
  buyBtn: { display: "inline-block", color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 12.3, fontWeight: 700, textDecoration: "none" },
  sources: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  sourceLink: { fontSize: 11, color: "#4F46E5", fontWeight: 700, textDecoration: "none", background: "#EEF2FF", borderRadius: 999, padding: "2px 9px" },
  leadCard: { border: "1px solid #E2E8F0", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#F8FAFC" },
  input: { border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#0F172A", boxSizing: "border-box", width: "100%" },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px 6px", borderTop: "1px solid #E2E8F0" },
  btn: { background: DEFAULT_GRAD, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  micBtn: { flex: "none", width: 38, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", display: "grid", placeItems: "center", cursor: "pointer", fontFamily: "inherit" },
  leadNote: { fontSize: 11.5, color: "#64748B", lineHeight: 1.5 },
  micNote: { display: "block", fontSize: 11.5, color: "#92400E", background: "#FFFBEB", borderTop: "1px solid #FDE68A", padding: "7px 12px", lineHeight: 1.5 },
  leaveLink: { background: "none", border: "none", color: "#64748B", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: "2px 0 0" },
  error: { color: "#B91C1C", fontSize: 12 },
  poweredRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap", borderTop: "1px solid #F1F5F9", padding: "8px 12px 10px", fontSize: 11.5 },
  poweredLink: { color: "#4F46E5", fontWeight: 700, textDecoration: "none" },
  poweredMuted: { color: "#94A3B8" },
};
