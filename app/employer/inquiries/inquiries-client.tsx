"use client";

/**
 * The company inbox as a messenger: conversation list on the left, thread on
 * the right — Brandon's design (Topezia Messages.dc.html), implemented over
 * the same data and routes as before.
 *
 * What the mockup shows that this deliberately does NOT: online dots, read
 * receipts, a typing indicator, "Create brief". Every one of those would be
 * a fake signal today — there is no presence system, no read tracking — and
 * this product doesn't render lights that aren't wired to anything. When
 * those systems exist, the spots for them are obvious. "Draft with AI" IS
 * wired now (POST …/draft): it only fills the compose box — the owner
 * edits and sends through the same Send as always.
 *
 * The three actions are still the whole model: Reply opens a thread, Archive
 * closes, Spam is a private judgement feeding the sender lockout. The sender
 * never learns which happened.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { EmployerGate, ES } from "../_components/EmployerSection";
import { INQUIRY_LIMITS } from "@/lib/company/inquiries";

type Msg = { id: string; sender: "COMPANY" | "CANDIDATE"; body: string; createdAt: string };
type Inquiry = {
  id: string;
  reason: string | null;
  message: string;
  answers: { question: string; answer: string }[] | null;
  status: "NEW" | "REPLIED" | "ARCHIVED" | "SPAM";
  repliedAt: string | null;
  createdAt: string;
  source: "FORM" | "WIDGET";
  visitorEmail: string | null;
  visitorName: string | null;
  visitorPhone: string | null;
  transcript: { role: "visitor" | "bot"; text: string }[] | null;
  brief: Brief | null;
  profile: {
    fullName: string | null;
    publicSlug: string | null;
    publicVisible: boolean;
    currentLocation: string | null;
    openToWork: boolean;
  } | null;
  messages: Msg[];
};
type Brief = {
  summary: string;
  wants: string[];
  budget: string | null;
  timeline: string | null;
  openQuestions: string[];
};
type Config = { contactEnabled: boolean; contactReasons: string[]; contactQuestions: string[] };
type Suggested = { reasons: string[]; questions: string[] };

const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";
const FILTERS = ["All", "New", "Replied", "Archived", "Spam"] as const;
type Filter = (typeof FILTERS)[number];

const AV_GRADS = [
  "linear-gradient(140deg,#7C3AED,#2563EB)",
  "linear-gradient(140deg,#0E7490,#2563EB)",
  "linear-gradient(140deg,#059669,#0E7490)",
  "linear-gradient(140deg,#B45309,#DC2626)",
  "linear-gradient(140deg,#4F46E5,#7C3AED)",
];
const avatarBg = (seed: string) => AV_GRADS[[...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AV_GRADS.length];

const senderName = (inq: Inquiry) =>
  inq.source === "WIDGET"
    ? inq.visitorName?.trim() || inq.visitorEmail || "Website visitor"
    : inq.profile?.fullName?.trim() || "Topezia member";
const senderEmail = (inq: Inquiry) => (inq.source === "WIDGET" ? inq.visitorEmail : null);
const initialsOf = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const lastActivity = (inq: Inquiry) => inq.messages.at(-1)?.createdAt ?? inq.createdAt;

export default function InquiriesClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Teach-the-bot from a transcript bubble: which bot line is being fixed,
  // and what the owner wants said instead.
  const [fixIdx, setFixIdx] = useState<number | null>(null);
  const [fixText, setFixText] = useState("");
  const [fixState, setFixState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [confDraft, setConfDraft] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    async function load(first: boolean) {
      try {
        const res = await fetch("/api/company/inquiries", { cache: "no-store" });
        if (stop) return;
        if (res.status === 401) { setGate("auth"); return; }
        if (res.status === 409) { setGate("company"); return; }
        if (!res.ok) throw new Error();
        const d = (await res.json()) as { config: Config; inquiries: Inquiry[]; suggested: Suggested };
        if (stop) return;
        setConfig((cur) => (first || !cur ? d.config : cur));
        setSuggested(d.suggested ?? null);
        setItems(d.inquiries);
      } catch {
        if (first) setError("Couldn't load your messages.");
      }
    }
    load(true);
    const timer = setInterval(() => { if (!document.hidden) load(false); }, 20_000);
    const onFocus = () => load(false);
    window.addEventListener("focus", onFocus);
    return () => { stop = true; clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  const list = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((i) =>
        filter === "All" ? i.status === "NEW" || i.status === "REPLIED" :
        i.status === ({ New: "NEW", Replied: "REPLIED", Archived: "ARCHIVED", Spam: "SPAM" } as const)[filter as Exclude<Filter, "All">]
      )
      .filter((i) => !q || `${senderName(i)} ${senderEmail(i) ?? ""} ${i.reason ?? ""} ${i.message}`.toLowerCase().includes(q))
      .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
  }, [items, filter, query]);

  const active = useMemo(() => (sel ? items?.find((i) => i.id === sel) ?? null : null), [items, sel]);
  const newCount = items?.filter((i) => i.status === "NEW").length ?? 0;

  // Desktop: auto-open the newest conversation so the pane is never blank.
  useEffect(() => {
    if (!sel && list.length && typeof window !== "undefined" && window.innerWidth > 900) setSel(list[0].id);
  }, [list, sel]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [active?.id, active?.messages.length]);

  async function setStatus(inq: Inquiry, status: "NEW" | "ARCHIVED" | "SPAM") {
    const res = await fetch(`/api/company/inquiries/${inq.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json().catch(() => ({}))) as { inquiry?: { status: Inquiry["status"] }; error?: string };
    if (!res.ok) { setError(data.error ?? "That didn't work — try again."); return; }
    setItems((cur) => (cur ?? []).map((i) => (i.id === inq.id ? { ...i, status: data.inquiry?.status ?? status } : i)));
  }

  async function sendReply() {
    if (!active || sending || !draft.trim()) return;
    setSending(true); setSendError(null);
    try {
      const res = await fetch(`/api/company/inquiries/${active.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: Msg; error?: string };
      if (!res.ok || !data.message) { setSendError(data.error ?? "Couldn't send that."); return; }
      const msg = data.message;
      setItems((cur) =>
        (cur ?? []).map((i) =>
          i.id === active.id
            ? { ...i, status: "REPLIED", repliedAt: i.repliedAt ?? msg.createdAt, messages: [...i.messages, msg] }
            : i
        )
      );
      setDraft("");
    } catch {
      setSendError("Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  /**
   * Teach the bot a better answer for a question it fumbled. The question
   * is the visitor's line immediately before the bot's — that's what the
   * bot was actually answering.
   */
  async function teachFix(question: string) {
    if (!fixText.trim() || fixState === "saving") return;
    setFixState("saving");
    try {
      const res = await fetch("/api/company/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer: fixText }),
      });
      if (!res.ok) { setFixState("error"); return; }
      setFixState("saved");
      setTimeout(() => { setFixIdx(null); setFixText(""); setFixState("idle"); }, 1400);
    } catch {
      setFixState("error");
    }
  }

  /** Fills the compose box, nothing more — the owner still edits and sends. */
  async function draftWithAi() {
    if (!active || drafting || sending) return;
    setDrafting(true); setSendError(null);
    try {
      const res = await fetch(`/api/company/inquiries/${active.id}/draft`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { draft?: string; error?: string };
      if (!res.ok || !data.draft) { setSendError(data.error ?? "Couldn't draft that one — write it by hand or try again."); return; }
      setDraft(data.draft);
    } catch {
      setSendError("Couldn't draft that one — write it by hand or try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function saveConfig(next: Config) {
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/company/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = (await res.json().catch(() => ({}))) as { config?: Config; error?: string };
      if (!res.ok) { setSaveError(data.error ?? "Couldn't save."); return; }
      setConfig(data.config ?? next);
      setConfDraft(null);
    } catch {
      setSaveError("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  function openConfig() {
    if (!config) return;
    const blank = config.contactReasons.length === 0 && config.contactQuestions.length === 0;
    setConfDraft(blank && suggested ? { ...config, contactReasons: suggested.reasons, contactQuestions: suggested.questions } : { ...config });
    setShowConfig(true);
  }

  if (gate) return <EmployerGate title="Messages" reason={gate} what="your messages" />;
  if (error && items === null) return <div style={{ ...ES.card }}><p style={ES.empty}>{error}</p></div>;
  if (config === null || items === null) return <div style={{ ...ES.card }}><p style={ES.empty}>Loading…</p></div>;

  const quickReplies = ["Happy to walk through this — what time works for a quick call?", "Thanks for reaching out — could you share a bit more about scope and timing?", "If you were happy with how this turned out, would you mind leaving a short review on our Topezia page?"];

  return (
    <div style={S.frame} className={active || showConfig ? "tzm-thread-open" : ""}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Conversation list ── */}
      <section style={S.listPane} className="tzm-list">
        <div style={S.listHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <h1 style={S.h1}>Messages</h1>
            {newCount > 0 && <span style={S.newChip}>{newCount} new</span>}
            <div style={{ flex: 1 }} />
            <button type="button" title="Contact form settings" onClick={openConfig} style={S.gearBtn} aria-label="Contact form settings">⚙</button>
          </div>
          <label style={S.search}>
            <span style={{ color: "#94A3B8" }}>⌕</span>
            <input
              placeholder="Search people, messages"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={S.searchInput}
            />
          </label>
          <div style={S.filterRow}>
            {FILTERS.map((f) => {
              const on = filter === f;
              return (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  style={{ ...S.filterChip, background: on ? "#EEF2FF" : "#fff", color: on ? "#4F46E5" : "#475569", borderColor: on ? "#C7D2FE" : "#E2E8F0" }}>
                  {f}{f === "New" && newCount ? ` · ${newCount}` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {list.map((c) => {
            const name = senderName(c);
            const on = c.id === sel;
            const isNew = c.status === "NEW";
            const preview = c.messages.at(-1)?.body ?? c.message;
            return (
              <div key={c.id} onClick={() => { setSel(c.id); setShowConfig(false); setDraft(""); setSendError(null); }}
                style={{ ...S.row, background: on ? "#F5F3FF" : "#fff", borderLeft: `3px solid ${on ? "#8B5CF6" : "transparent"}` }}>
                <span style={{ ...S.avatar, background: avatarBg(name) }}>{initialsOf(name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <b style={{ ...S.rowName, fontWeight: isNew ? 800 : 600 }}>{name}</b>
                    <span style={S.rowTime}>{when(lastActivity(c))}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                    <span style={{ ...S.chanTag, background: c.source === "WIDGET" ? "#F5F3FF" : "#ECFDF5", color: c.source === "WIDGET" ? "#6D28D9" : "#047857" }}>
                      {c.source === "WIDGET" ? "Website chat" : "Contact form"}
                    </span>
                    <span style={{ ...S.preview, color: isNew ? "#334155" : "#94A3B8" }}>{preview}</span>
                    {isNew && <span style={S.unreadDot} />}
                  </span>
                </span>
              </div>
            );
          })}
          {list.length === 0 && (
            <div style={S.emptyList}>
              <b style={{ display: "block", fontSize: 13, color: "#334155" }}>Nothing here</b>
              <span style={{ display: "block", fontSize: 11.8, marginTop: 5, lineHeight: 1.6 }}>
                {filter === "All" && !query
                  ? config.contactEnabled
                    ? "Messages from your contact form and site chat land here."
                    : "Turn on your contact form or site chat and messages land here."
                  : "Try another filter or clear your search."}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── Thread / config pane ── */}
      <section style={S.threadPane} className="tzm-thread">
        {showConfig && confDraft ? (
          <div style={{ padding: "22px 24px", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <button type="button" style={S.backBtn} onClick={() => setShowConfig(false)}>←</button>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Contact form</h2>
              <span style={config.contactEnabled ? ES.pillLive : ES.pillDraft}>{config.contactEnabled ? "On" : "Off"}</span>
            </div>
            <div style={{ ...ES.card, maxWidth: 640 }}>
              <label style={ES.label}>Reasons people can pick (up to {INQUIRY_LIMITS.reasons}, one per line)</label>
              <textarea style={{ ...ES.input, minHeight: 92, resize: "vertical", marginBottom: 14 }}
                value={confDraft.contactReasons.join("\n")}
                placeholder={"Hiring inquiry\nPartnership\nPress"}
                onChange={(e) => setConfDraft({ ...confDraft, contactReasons: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, INQUIRY_LIMITS.reasons) })} />
              <label style={ES.label}>Extra questions (up to {INQUIRY_LIMITS.questions}, one per line, optional for the sender)</label>
              <textarea style={{ ...ES.input, minHeight: 74, resize: "vertical", marginBottom: 14 }}
                value={confDraft.contactQuestions.join("\n")}
                placeholder={"What's your budget?\nWhen would you want to start?"}
                onChange={(e) => setConfDraft({ ...confDraft, contactQuestions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, INQUIRY_LIMITS.questions) })} />
              {saveError && <p style={ES.error}>{saveError}</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={ES.btn} disabled={saving} onClick={() => saveConfig({ ...confDraft, contactEnabled: true })}>
                  {saving ? "Saving…" : config.contactEnabled ? "Save" : "Save and turn on"}
                </button>
                {config.contactEnabled && (
                  <button type="button" style={ES.btnDanger} disabled={saving} onClick={() => saveConfig({ ...config, contactEnabled: false })}>Turn off</button>
                )}
                {suggested && (suggested.reasons.length > 0 || suggested.questions.length > 0) && (
                  <button type="button" style={{ ...ES.btnGhost, marginLeft: "auto" }}
                    onClick={() => setConfDraft({ ...confDraft, contactReasons: suggested.reasons, contactQuestions: suggested.questions })}>
                    Reset to suggested
                  </button>
                )}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.6, color: "#94A3B8" }}>
                Suggestions come from your page — live roles add a hiring reason; shown work, clients or project posts add quote and budget fields.
              </p>
            </div>
          </div>
        ) : !active ? (
          <div style={S.noThread}>
            <b style={{ fontSize: 14, color: "#334155" }}>Pick a conversation</b>
            <span style={{ fontSize: 12, color: "#94A3B8", marginTop: 6, lineHeight: 1.6 }}>
              Everything from your contact form and website chat, in one place.
            </span>
          </div>
        ) : (
          <>
            {(() => {
              const name = senderName(active);
              const profileHref = active.profile?.publicVisible && active.profile.publicSlug ? `/p/${active.profile.publicSlug}` : null;
              const sub = [senderEmail(active), active.visitorPhone, active.profile?.currentLocation, active.reason].filter(Boolean).join(" · ");
              const closed = active.status === "ARCHIVED" || active.status === "SPAM";
              return (
                <>
                  <header style={S.threadHead}>
                    <button type="button" style={S.backBtn} className="tzm-back" onClick={() => setSel(null)}>←</button>
                    <span style={{ ...S.avatar, width: 40, height: 40, background: avatarBg(name) }}>{initialsOf(name)}</span>
                    <span style={{ flex: 1, minWidth: 140 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.2px" }}>{name}</b>
                        <span style={{ ...S.chanTag, background: active.source === "WIDGET" ? "#F5F3FF" : "#ECFDF5", color: active.source === "WIDGET" ? "#6D28D9" : "#047857" }}>
                          {active.source === "WIDGET" ? "Website chat" : "Contact form"}
                        </span>
                        {active.profile?.openToWork && <span style={ES.pillLive}>Open to work</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: "#64748B", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub || when(active.createdAt)}</span>
                    </span>
                    <span style={{ display: "flex", gap: 7, flex: "none" }}>
                      {profileHref && (
                        <a href={profileHref} target="_blank" rel="noreferrer" title="Open Topezia profile" style={S.iconBtn}>↗</a>
                      )}
                      {!closed && (
                        <button type="button" title="Archive" style={S.iconBtn} onClick={() => setStatus(active, "ARCHIVED")}>🗄</button>
                      )}
                      {active.status === "NEW" && (
                        <button type="button" title="Mark as spam" style={{ ...S.iconBtn, color: "#B91C1C" }} onClick={() => setStatus(active, "SPAM")}>⚑</button>
                      )}
                      {closed && (
                        <button type="button" style={{ ...ES.btnGhost }} onClick={() => setStatus(active, "NEW")}>
                          {active.repliedAt ? "Reopen" : "Move to New"}
                        </button>
                      )}
                    </span>
                  </header>

                  {active.status === "NEW" && (
                    <div style={S.banner}>
                      <span style={{ flex: 1 }}>New enquiry — they can&apos;t follow up until you reply.</span>
                    </div>
                  )}
                  {active.status === "SPAM" && (
                    <div style={{ ...S.banner, background: "#F8FAFC", borderColor: "#E2E8F0", color: "#64748B" }}>
                      <span style={{ flex: 1 }}>Marked as spam. To them it just looks unanswered. Several marks from different companies block a sender everywhere.</span>
                    </div>
                  )}

                  <div ref={scroller} style={S.threadScroll}>
                    <div style={S.threadCol}>
                      <div style={S.dayRow}>
                        <span style={S.dayLine} />
                        <span style={S.dayLabel}>{new Date(active.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                        <span style={S.dayLine} />
                      </div>

                      {(active.transcript?.length ?? 0) > 0 && (
                        <>
                          <span style={S.sysPill}>Chat with the AI assistant, before they left this message</span>
                          {active.transcript!.map((t, i) => {
                            // What the bot was answering: the visitor line
                            // right before it. Without one there's nothing
                            // to teach, so no Fix affordance.
                            const asked = t.role === "bot" ? active.transcript!.slice(0, i).reverse().find((p) => p.role === "visitor")?.text : undefined;
                            const fixing = fixIdx === i;
                            return (
                              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: t.role === "visitor" ? "flex-end" : "flex-start", gap: 4, alignSelf: "stretch" }}>
                                <span style={{ ...S.bubble, ...(t.role === "visitor" ? S.bubbleDimOut : S.bubbleDimIn), alignSelf: t.role === "visitor" ? "flex-end" : "flex-start" }}>{t.text}</span>
                                {asked && !fixing && (
                                  <button type="button" style={S.fixLink}
                                    onClick={() => { setFixIdx(i); setFixText(""); setFixState("idle"); }}>
                                    Fix this answer
                                  </button>
                                )}
                                {asked && fixing && (
                                  <div style={S.fixBox}>
                                    <span style={S.fixHead}>They asked: &ldquo;{asked.slice(0, 120)}&rdquo;</span>
                                    <textarea
                                      autoFocus
                                      rows={3}
                                      value={fixText}
                                      maxLength={900}
                                      placeholder="What should it have said? The bot will use this from now on."
                                      onChange={(e) => setFixText(e.target.value)}
                                      style={S.fixInput}
                                    />
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                      <button type="button" style={{ ...ES.btn, padding: "7px 14px", fontSize: 12 }}
                                        disabled={!fixText.trim() || fixState === "saving"}
                                        onClick={() => teachFix(asked)}>
                                        {fixState === "saving" ? "Teaching…" : fixState === "saved" ? "Learned ✓" : "Teach the bot"}
                                      </button>
                                      <button type="button" style={{ ...ES.btnGhost, padding: "7px 14px", fontSize: 12 }}
                                        onClick={() => { setFixIdx(null); setFixText(""); setFixState("idle"); }}>
                                        Cancel
                                      </button>
                                      {fixState === "error" && <span style={{ fontSize: 11.5, color: "#B91C1C" }}>Couldn&apos;t save that.</span>}
                                      {fixState === "saved" && <span style={{ fontSize: 11.5, color: "#047857" }}>It&apos;ll answer this way from now on.</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <span style={S.sysPill}>They left their message ↓</span>
                        </>
                      )}

                      {/* What they gave us about themselves — pinned into the
                          conversation where they gave it, not hidden in a
                          header. FORM senders link to their Topezia profile
                          instead of an email: members are reached here. */}
                      {/* What the chat established about the job. Only ever
                          shows what they actually said — a missing budget
                          line means they never gave one. */}
                      {active.brief && (
                        <div style={S.briefCard}>
                          <span style={S.briefTitle}>The brief</span>
                          <span style={{ fontSize: 13.4, color: "#0F172A", lineHeight: 1.6, fontWeight: 600 }}>{active.brief.summary}</span>
                          {active.brief.wants.length > 0 && (
                            <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                              {active.brief.wants.map((w) => <span key={w} style={S.wantChip}>{w}</span>)}
                            </span>
                          )}
                          <span style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 2 }}>
                            <span style={S.briefStat}><b style={S.briefKey}>Budget</b>{active.brief.budget ?? <i style={S.notSaid}>not said</i>}</span>
                            <span style={S.briefStat}><b style={S.briefKey}>Timing</b>{active.brief.timeline ?? <i style={S.notSaid}>not said</i>}</span>
                          </span>
                          {active.brief.openQuestions.length > 0 && (
                            <span style={{ display: "block", marginTop: 4 }}>
                              <b style={{ ...S.briefKey, display: "block", marginBottom: 4 }}>Still to ask</b>
                              {active.brief.openQuestions.map((q) => (
                                <span key={q} style={{ display: "block", fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>· {q}</span>
                              ))}
                            </span>
                          )}
                        </div>
                      )}

                      <div style={S.contactCard}>
                        <span style={S.contactTitle}>Their details</span>
                        <span style={S.contactRow}><b style={S.contactKey}>Name</b>{name}</span>
                        {active.visitorEmail && (
                          <span style={S.contactRow}><b style={S.contactKey}>Email</b><a href={`mailto:${active.visitorEmail}`} style={S.contactLink}>{active.visitorEmail}</a></span>
                        )}
                        {active.visitorPhone && (
                          <span style={S.contactRow}><b style={S.contactKey}>Phone</b><a href={`tel:${active.visitorPhone.replace(/[^\d+]/g, "")}`} style={S.contactLink}>{active.visitorPhone}</a></span>
                        )}
                        {active.source === "FORM" && profileHref && (
                          <span style={S.contactRow}><b style={S.contactKey}>Profile</b><a href={profileHref} target="_blank" rel="noreferrer" style={S.contactLink}>topezia.com{profileHref} ↗</a></span>
                        )}
                        {active.reason && <span style={S.contactRow}><b style={S.contactKey}>Reason</b>{active.reason}</span>}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                        <span style={{ ...S.bubble, ...S.bubbleIn }}>
                          {active.message}
                          {(active.answers ?? []).map((a) => (
                            <span key={a.question} style={S.answerLine}>
                              <b style={{ color: "#475569" }}>{a.question}</b> — {a.answer}
                            </span>
                          ))}
                        </span>
                        <span style={S.msgMeta}>{name} · {when(active.createdAt)}</span>
                      </div>

                      {active.messages.map((m) => {
                        const out = m.sender === "COMPANY";
                        return (
                          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start", gap: 5 }}>
                            <span style={{ ...S.bubble, ...(out ? S.bubbleOut : S.bubbleIn) }}>{m.body}</span>
                            <span style={S.msgMeta}>{out ? "You" : name} · {when(m.createdAt)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!closed ? (
                    <div style={{ padding: "0 24px 18px" }}>
                      <div style={{ maxWidth: 760, margin: "0 auto" }}>
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                          {quickReplies.map((qr) => (
                            <button key={qr} type="button" style={S.quickChip} onClick={() => setDraft(qr)}>
                              {qr.length > 42 ? `${qr.slice(0, 42)}…` : qr}
                            </button>
                          ))}
                        </div>
                        <form style={S.composer} onSubmit={(e: FormEvent) => { e.preventDefault(); sendReply(); }}>
                          <textarea
                            placeholder={`Reply to ${name}…  ⌘↵ to send`}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); } }}
                            rows={2}
                            maxLength={INQUIRY_LIMITS.reply}
                            style={S.composerInput}
                          />
                          {sendError && <p style={{ ...ES.error, margin: "8px 0 0" }}>{sendError}</p>}
                          <div style={S.composerBar}>
                            <button type="button" disabled={drafting || sending} onClick={draftWithAi}
                              title="Write a reply draft from this conversation — you edit it before sending"
                              style={{ ...S.draftBtn, opacity: drafting ? 0.6 : 1, cursor: drafting ? "wait" : "pointer" }}>
                              {drafting ? "Drafting…" : "✨ Draft with AI"}
                            </button>
                            {active.messages.length === 0 && (
                              <span style={{ fontSize: 11, color: "#94A3B8" }} className="tzm-composer-hint">Replying opens the conversation and emails them.</span>
                            )}
                            <span style={{ flex: 1 }} />
                            <button type="submit" disabled={sending || !draft.trim()}
                              style={{ ...S.sendBtn, background: draft.trim() ? GRAD : "#E2E8F0", color: draft.trim() ? "#fff" : "#94A3B8", cursor: draft.trim() ? "pointer" : "not-allowed" }}>
                              {sending ? "Sending…" : "Send →"}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "0 24px 18px" }}>
                      <div style={{ maxWidth: 760, margin: "0 auto", fontSize: 12, color: "#94A3B8" }}>
                        This conversation is {active.status === "SPAM" ? "in spam" : "archived"} — reopen it to reply.
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </section>
    </div>
  );
}

const CSS = `
.tzm-back{display:none !important}
@media (max-width:900px){
  .tzm-back{display:grid !important}
  .tzm-thread{display:none !important}
  .tzm-thread-open .tzm-thread{display:flex !important}
  .tzm-thread-open .tzm-list{display:none !important}
}
@media (max-width:640px){
  .tzm-composer-hint{display:none}
}
`;

const S: Record<string, CSSProperties> = {
  frame: { display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", height: "calc(100vh - 120px)", minHeight: 480, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden" },
  // minHeight 0 on BOTH panes: grid children default to min-height auto and
  // grow past the frame instead of letting their inner overflow scroll —
  // this exact omission shipped once as "I can't scroll the messages".
  listPane: { borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "#fff" },
  listHead: { padding: "16px 16px 12px", borderBottom: "1px solid #E2E8F0" },
  h1: { margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.5px" },
  newChip: { background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "3px 9px", fontSize: 10.5, fontWeight: 700 },
  gearBtn: { width: 30, height: 30, borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", display: "grid", placeItems: "center", color: "#334155", cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  search: { display: "flex", alignItems: "center", gap: 9, marginTop: 13, background: "#F1F5F9", borderRadius: 10, padding: "8px 12px", color: "#64748B" },
  searchInput: { flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", fontFamily: "inherit", fontSize: 12.5, color: "#0F172A" },
  filterRow: { display: "flex", gap: 6, marginTop: 12, overflowX: "auto", paddingBottom: 2 },
  filterChip: { flex: "none", border: "1px solid", borderRadius: 999, padding: "6px 13px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" },
  row: { display: "flex", gap: 12, padding: "14px 16px", borderBottom: "1px solid #F1F5F9", cursor: "pointer" },
  avatar: { flex: "none", width: 38, height: 38, borderRadius: 11, color: "#fff", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 800 },
  rowName: { flex: 1, minWidth: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  rowTime: { flex: "none", fontSize: 10.5, color: "#64748B" },
  chanTag: { flex: "none", borderRadius: 5, padding: "2px 7px", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3 },
  preview: { flex: 1, minWidth: 0, fontSize: 11.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  unreadDot: { flex: "none", width: 9, height: 9, borderRadius: "50%", background: GRAD },
  emptyList: { padding: "44px 26px", textAlign: "center", color: "#64748B" },
  threadPane: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "#F8FAFC" },
  threadHead: { background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "13px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  // No inline `display`: the .tzm-back CSS owns visibility (inline style
  // would beat the media query and the arrow showed on desktop).
  backBtn: { width: 34, height: 34, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", placeItems: "center", color: "#334155", cursor: "pointer", fontSize: 15, fontFamily: "inherit" },
  iconBtn: { width: 34, height: 34, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", display: "grid", placeItems: "center", color: "#64748B", cursor: "pointer", fontSize: 14, textDecoration: "none", fontFamily: "inherit" },
  banner: { background: "#FFFBEB", borderBottom: "1px solid #FDE68A", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, color: "#92400E", fontSize: 12, fontWeight: 600 },
  threadScroll: { flex: 1, overflowY: "auto", minHeight: 0, padding: "20px 24px 8px" },
  threadCol: { maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 },
  dayRow: { display: "flex", alignItems: "center", gap: 12, color: "#64748B" },
  dayLine: { flex: 1, height: 1, background: "#E2E8F0" },
  dayLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" },
  sysPill: { alignSelf: "center", background: "#EEF2FF", color: "#4F46E5", border: "1px solid #E0E7FF", borderRadius: 999, padding: "5px 14px", fontSize: 11, fontWeight: 600, textAlign: "center" },
  contactCard: { alignSelf: "stretch", background: "#fff", border: "1px solid #E0E7FF", borderLeft: "3px solid #8B5CF6", borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 2px 8px rgba(15,23,42,.04)" },
  briefCard: { alignSelf: "stretch", background: "linear-gradient(180deg,#FFFBEB,#fff)", border: "1px solid #FDE68A", borderLeft: "3px solid #F59E0B", borderRadius: 12, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 7, boxShadow: "0 2px 8px rgba(15,23,42,.04)" },
  briefTitle: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#B45309" },
  briefKey: { fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4, marginRight: 8 },
  briefStat: { fontSize: 12.8, color: "#334155" },
  notSaid: { color: "#B9C2CF", fontStyle: "italic" },
  wantChip: { background: "#fff", border: "1px solid #FDE68A", borderRadius: 999, padding: "3px 10px", fontSize: 11.5, color: "#92400E", fontWeight: 600 },
  fixLink: { alignSelf: "flex-start", border: 0, background: "none", padding: "0 4px", fontSize: 11, fontWeight: 600, color: "#8B5CF6", cursor: "pointer", fontFamily: "inherit" },
  fixBox: { alignSelf: "stretch", background: "#fff", border: "1px solid #E0E7FF", borderRadius: 12, padding: "12px 14px", marginTop: 2 },
  fixHead: { display: "block", fontSize: 11.5, color: "#64748B", marginBottom: 8 },
  fixInput: { width: "100%", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px", outline: "none", resize: "vertical", fontFamily: "inherit", fontSize: 12.8, lineHeight: 1.6, color: "#0F172A", boxSizing: "border-box" },
  contactTitle: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#8B5CF6", marginBottom: 2 },
  contactRow: { display: "flex", gap: 10, fontSize: 12.5, color: "#334155", alignItems: "baseline", minWidth: 0 },
  contactKey: { flex: "none", width: 52, fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 },
  contactLink: { color: "#4F46E5", fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  bubble: { maxWidth: "78%", borderRadius: "16px 16px 16px 4px", padding: "11px 15px", fontSize: 13.2, lineHeight: 1.65, whiteSpace: "pre-wrap" },
  bubbleIn: { background: "#fff", color: "#0F172A", border: "1px solid #E2E8F0", boxShadow: "0 2px 8px rgba(15,23,42,.04)" },
  bubbleOut: { background: GRAD, color: "#fff", border: "1px solid transparent", borderRadius: "16px 16px 4px 16px", boxShadow: "0 8px 20px rgba(99,102,241,.24)" },
  bubbleDimIn: { background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0", fontSize: 12.3, maxWidth: "70%" },
  bubbleDimOut: { background: "#EEF2FF", color: "#64748B", border: "1px solid #E0E7FF", borderRadius: "16px 16px 4px 16px", fontSize: 12.3, maxWidth: "70%" },
  answerLine: { display: "block", marginTop: 8, fontSize: 12.3, color: "#64748B" },
  msgMeta: { fontSize: 10.5, color: "#94A3B8", padding: "0 4px" },
  quickChip: { border: "1px solid #E2E8F0", background: "#fff", borderRadius: 999, padding: "7px 13px", fontSize: 11.5, fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  draftBtn: { flex: "none", border: "1px solid #DDD6FE", background: "#F5F3FF", color: "#6D28D9", borderRadius: 999, padding: "7px 13px", fontSize: 11.5, fontWeight: 700, fontFamily: "inherit" },
  composer: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 15, padding: "12px 14px", boxShadow: "0 8px 26px rgba(15,23,42,.06)" },
  composerInput: { width: "100%", border: 0, outline: "none", resize: "none", fontFamily: "inherit", fontSize: 13.2, lineHeight: 1.65, color: "#0F172A", background: "transparent", boxSizing: "border-box" },
  composerBar: { display: "flex", alignItems: "center", gap: 7, marginTop: 8, paddingTop: 10, borderTop: "1px solid #F1F5F9" },
  sendBtn: { display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 10, padding: "9px 17px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", boxShadow: "0 6px 16px rgba(99,102,241,.3)" },
  noThread: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 },
};
