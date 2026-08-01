"use client";

/**
 * The company inbox, and the switch that creates it.
 *
 * Two things on one page on purpose: the form config IS the inbox's front
 * door, and a separate settings page for three fields would be a second place
 * to look for one idea. Layout: config card on top (collapsed to a status
 * line once enabled), then the inbox.
 *
 * The three actions on an item are the whole model: Reply opens a thread,
 * Archive closes the item, Spam is a private judgement that also feeds the
 * sender's platform-wide lockout (3+ distinct companies — lib/company/
 * inquiries.ts). The sender is never told which of the three happened.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerSection";
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
  // FORM inquiries carry a profile; WIDGET ones carry the visitor fields.
  source: "FORM" | "WIDGET";
  visitorEmail: string | null;
  visitorName: string | null;
  transcript: { role: "visitor" | "bot"; text: string }[] | null;
  profile: {
    fullName: string | null;
    publicSlug: string | null;
    publicVisible: boolean;
    currentLocation: string | null;
    openToWork: boolean;
  } | null;
  messages: Msg[];
};
type Config = { contactEnabled: boolean; contactReasons: string[]; contactQuestions: string[] };
type Suggested = { reasons: string[]; questions: string[] };

const TABS = ["New", "Replied", "Archived", "Spam"] as const;
type Tab = (typeof TABS)[number];
const TAB_STATUS: Record<Tab, Inquiry["status"]> = { New: "NEW", Replied: "REPLIED", Archived: "ARCHIVED", Spam: "SPAM" };

export default function InquiriesClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [tab, setTab] = useState<Tab>("New");

  // Config editor state
  const [editingForm, setEditingForm] = useState(false);
  const [draft, setDraft] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reply composer state — one open at a time is plenty.
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/company/inquiries", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { setGate("auth"); return null; }
        if (res.status === 409) { setGate("company"); return null; }
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ config: Config; inquiries: Inquiry[]; suggested: Suggested }>;
      })
      .then((d) => {
        if (!d) return;
        setConfig(d.config);
        setSuggested(d.suggested ?? null);
        setItems(d.inquiries);
      })
      .catch(() => setError("Couldn't load your inbox."));
  }, []);

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
      setEditingForm(false);
    } catch {
      setSaveError("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(inq: Inquiry, status: "NEW" | "ARCHIVED" | "SPAM") {
    const res = await fetch(`/api/company/inquiries/${inq.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json().catch(() => ({}))) as { inquiry?: { status: Inquiry["status"] }; error?: string };
    if (!res.ok) { setError(data.error ?? "That didn't work — reload and try again."); return; }
    setItems((cur) => (cur ?? []).map((i) => (i.id === inq.id ? { ...i, status: data.inquiry?.status ?? status } : i)));
  }

  async function sendReply(inq: Inquiry) {
    if (replyBusy || !replyText.trim()) return;
    setReplyBusy(true); setReplyError(null);
    try {
      const res = await fetch(`/api/company/inquiries/${inq.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: Msg; error?: string };
      if (!res.ok || !data.message) { setReplyError(data.error ?? "Couldn't send that."); return; }
      const msg = data.message;
      setItems((cur) =>
        (cur ?? []).map((i) =>
          i.id === inq.id
            ? { ...i, status: "REPLIED", repliedAt: i.repliedAt ?? msg.createdAt, messages: [...i.messages, msg] }
            : i
        )
      );
      setReplyFor(null); setReplyText("");
      if (inq.status === "NEW") setTab("Replied");
    } catch {
      setReplyError("Couldn't send that.");
    } finally {
      setReplyBusy(false);
    }
  }

  /** The editor's starting point: the saved config, except when it's still
   *  blank — then the suggestions derived from the company's own page (live
   *  roles → hiring reason; shown work/clients/project bids → services
   *  reasons + budget/timing questions). Nothing is written until Save. */
  function draftFrom(cfg: Config): Config {
    const blank = cfg.contactReasons.length === 0 && cfg.contactQuestions.length === 0;
    if (blank && suggested) {
      return { ...cfg, contactReasons: suggested.reasons, contactQuestions: suggested.questions };
    }
    return { ...cfg };
  }

  if (gate) return <EmployerGate title="Inbox" reason={gate} what="your inbox" />;
  if (error && items === null) {
    return (
      <EmployerSection title="Inbox">
        <div style={ES.card}><p style={ES.empty}>{error}</p></div>
      </EmployerSection>
    );
  }
  if (config === null || items === null) {
    return (
      <EmployerSection title="Inbox">
        <div style={ES.card}><p style={ES.empty}>Loading…</p></div>
      </EmployerSection>
    );
  }

  const counts = Object.fromEntries(TABS.map((t) => [t, items.filter((i) => i.status === TAB_STATUS[t]).length])) as Record<Tab, number>;
  const visible = items.filter((i) => i.status === TAB_STATUS[tab]);

  return (
    <EmployerSection
      title="Inbox"
      subtitle="Messages people send through your contact form. Replying opens a conversation; until you reply, they can't follow up."
    >
      {error && <p style={ES.error}>{error}</p>}

      {/* ── Contact form config ── */}
      <div style={{ ...ES.card, marginBottom: 18 }}>
        {!editingForm ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={config.contactEnabled ? ES.pillLive : ES.pillDraft}>
              {config.contactEnabled ? "Contact form is on" : "Contact form is off"}
            </span>
            <span style={{ ...ES.empty, flex: 1, minWidth: 200 }}>
              {config.contactEnabled
                ? `Visitors can write to you from your public page${config.contactReasons.length ? ` and pick from ${config.contactReasons.length} reasons` : ""}.`
                : "Your public page shows no way to message you until you turn this on."}
            </span>
            <button
              type="button"
              style={ES.btnGhost}
              onClick={() => { setDraft(draftFrom(config)); setEditingForm(true); setSaveError(null); }}
            >
              {config.contactEnabled ? "Edit form" : "Set up"}
            </button>
            <button
              type="button"
              style={config.contactEnabled ? ES.btnDanger : ES.btn}
              // Turning ON a never-configured form ships the suggested
              // defaults rather than a bare message box; turning off leaves
              // the saved fields alone for when it comes back on.
              onClick={() => saveConfig(config.contactEnabled ? { ...config, contactEnabled: false } : { ...draftFrom(config), contactEnabled: true })}
              disabled={saving}
            >
              {config.contactEnabled ? "Turn off" : "Turn on"}
            </button>
          </div>
        ) : draft && (
          <div>
            <label style={ES.label}>Reasons people can pick (up to {INQUIRY_LIMITS.reasons}, one per line)</label>
            <textarea
              style={{ ...ES.input, minHeight: 92, resize: "vertical", marginBottom: 14 }}
              value={draft.contactReasons.join("\n")}
              placeholder={"Hiring inquiry\nPartnership\nPress"}
              onChange={(e) => setDraft({ ...draft, contactReasons: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, INQUIRY_LIMITS.reasons) })}
            />
            <label style={ES.label}>Extra questions (up to {INQUIRY_LIMITS.questions}, one per line, all optional for the sender)</label>
            <textarea
              style={{ ...ES.input, minHeight: 74, resize: "vertical", marginBottom: 14 }}
              value={draft.contactQuestions.join("\n")}
              placeholder={"What's your budget?\nWhen would you want to start?"}
              onChange={(e) => setDraft({ ...draft, contactQuestions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, INQUIRY_LIMITS.questions) })}
            />
            {saveError && <p style={ES.error}>{saveError}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={ES.btn} disabled={saving} onClick={() => saveConfig({ ...draft, contactEnabled: true })}>
                {saving ? "Saving…" : config.contactEnabled ? "Save" : "Save and turn on"}
              </button>
              <button type="button" style={ES.btnGhost} onClick={() => setEditingForm(false)}>Cancel</button>
              {suggested && (suggested.reasons.length > 0 || suggested.questions.length > 0) && (
                <button
                  type="button"
                  style={{ ...ES.btnGhost, marginLeft: "auto" }}
                  onClick={() => setDraft({ ...draft, contactReasons: suggested.reasons, contactQuestions: suggested.questions })}
                >
                  Reset to suggested
                </button>
              )}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.6, color: "#94A3B8" }}>
              Suggestions come from your page — live roles add a hiring reason; shown work,
              clients or project posts add quote and budget fields. Edit anything; senders
              answering an older version of a question keep their original wording.
            </p>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabOn : {}) }}>
            {t}{counts[t] ? ` · ${counts[t]}` : ""}
          </button>
        ))}
      </div>

      {/* ── Inbox ── */}
      {visible.length === 0 ? (
        <div style={ES.card}>
          <p style={ES.empty}>
            {tab === "New"
              ? config.contactEnabled
                ? "Nothing waiting. New messages land here — you'll also get an email."
                : "Nothing here — and nothing can arrive while the form is off."
              : `Nothing ${tab.toLowerCase()} yet.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((inq) => {
            const isWidget = inq.source === "WIDGET";
            const name = isWidget
              ? inq.visitorName?.trim() || inq.visitorEmail || "A website visitor"
              : inq.profile?.fullName?.trim() || "A Topezia member";
            const profileHref = inq.profile?.publicVisible && inq.profile.publicSlug ? `/p/${inq.profile.publicSlug}` : null;
            return (
              <div key={inq.id} style={ES.card}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  {profileHref ? (
                    <a href={profileHref} target="_blank" rel="noreferrer" style={S.sender}>{name} ↗</a>
                  ) : (
                    <span style={S.sender}>{name}</span>
                  )}
                  {isWidget && <span style={S.widgetPill}>Website chat</span>}
                  {isWidget && inq.visitorName && inq.visitorEmail && <span style={S.meta2}>{inq.visitorEmail}</span>}
                  {inq.reason && <span style={S.reasonPill}>{inq.reason}</span>}
                  {inq.profile?.openToWork && <span style={ES.pillLive}>Open to work</span>}
                  <span style={S.meta}>
                    {inq.profile?.currentLocation ? `${inq.profile.currentLocation} · ` : ""}
                    {new Date(inq.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>

                {isWidget && (inq.transcript?.length ?? 0) > 0 && (
                  <details style={S.transcript}>
                    <summary style={S.transcriptHead}>
                      Chat before this message ({inq.transcript!.length} turns)
                    </summary>
                    {inq.transcript!.map((t, i) => (
                      <p key={i} style={S.transcriptTurn}>
                        <b style={{ color: t.role === "bot" ? "#8B5CF6" : "#475569" }}>{t.role === "bot" ? "Bot" : "Visitor"}</b> — {t.text}
                      </p>
                    ))}
                  </details>
                )}

                <p style={S.body}>{inq.message}</p>
                {(inq.answers ?? []).map((a) => (
                  <p key={a.question} style={S.answer}>
                    <b style={{ color: "#475569" }}>{a.question}</b> — {a.answer}
                  </p>
                ))}

                {inq.messages.length > 0 && (
                  <div style={S.thread}>
                    {inq.messages.map((m) => (
                      <div key={m.id} style={{ ...S.msg, ...(m.sender === "COMPANY" ? S.msgOurs : {}) }}>
                        <span style={S.msgWho}>{m.sender === "COMPANY" ? "You" : name}</span>
                        {m.body}
                      </div>
                    ))}
                  </div>
                )}

                {replyFor === inq.id ? (
                  <div style={{ marginTop: 12 }}>
                    <textarea
                      style={{ ...ES.input, minHeight: 80, resize: "vertical" }}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={INQUIRY_LIMITS.reply}
                      placeholder={`Reply to ${name}…`}
                      autoFocus
                    />
                    {replyError && <p style={{ ...ES.error, marginTop: 10, marginBottom: 0 }}>{replyError}</p>}
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <button type="button" style={ES.btn} disabled={replyBusy} onClick={() => sendReply(inq)}>
                        {replyBusy ? "Sending…" : "Send reply"}
                      </button>
                      <button type="button" style={ES.btnGhost} onClick={() => { setReplyFor(null); setReplyError(null); }}>Cancel</button>
                    </div>
                    {inq.messages.length === 0 && (
                      <p style={S.fine}>Replying opens a conversation and emails them. This is the step they can't take — only you can.</p>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    {(inq.status === "NEW" || inq.status === "REPLIED") && (
                      <button type="button" style={ES.btn} onClick={() => { setReplyFor(inq.id); setReplyText(""); setReplyError(null); }}>
                        Reply
                      </button>
                    )}
                    {(inq.status === "NEW" || inq.status === "REPLIED") && (
                      <button type="button" style={ES.btnGhost} onClick={() => setStatus(inq, "ARCHIVED")}>Archive</button>
                    )}
                    {inq.status === "NEW" && (
                      <button type="button" style={ES.btnDanger} onClick={() => setStatus(inq, "SPAM")}>Mark as spam</button>
                    )}
                    {(inq.status === "ARCHIVED" || inq.status === "SPAM") && (
                      <button type="button" style={ES.btnGhost} onClick={() => setStatus(inq, "NEW")}>
                        {inq.repliedAt ? "Reopen conversation" : "Move back to New"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "Spam" && counts.Spam > 0 && (
        <p style={{ ...S.fine, marginTop: 14 }}>
          Spam marks are never shown to the sender — to them it just looks unanswered. Someone
          marked spam by several companies loses the ability to send messages at all.
        </p>
      )}
    </EmployerSection>
  );
}

const S: Record<string, CSSProperties> = {
  tab: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 700, color: "#64748B", cursor: "pointer", fontFamily: "inherit" },
  tabOn: { background: "#EEF2FF", borderColor: "#C7D2FE", color: "#4F46E5" },
  sender: { fontSize: 14, fontWeight: 800, color: "#0F172A", textDecoration: "none" },
  widgetPill: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#F5F3FF", color: "#7C3AED", border: "1px solid #DDD6FE" },
  meta2: { fontSize: 11.5, color: "#94A3B8" },
  transcript: { marginTop: 10, border: "1px solid #F1F5F9", borderRadius: 10, padding: "8px 12px", background: "#F8FAFC" },
  transcriptHead: { fontSize: 11.5, fontWeight: 700, color: "#64748B", cursor: "pointer" },
  transcriptTurn: { margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "#475569", whiteSpace: "pre-wrap" },
  reasonPill: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#EEF2FF", color: "#4F46E5", border: "1px solid #C7D2FE" },
  meta: { fontSize: 11.5, color: "#94A3B8", marginLeft: "auto" },
  body: { margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.65, color: "#334155", whiteSpace: "pre-wrap" },
  answer: { margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "#64748B" },
  thread: { marginTop: 14, borderTop: "1px solid #F1F5F9", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  msg: { fontSize: 13, lineHeight: 1.6, color: "#334155", background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 10, padding: "9px 12px", whiteSpace: "pre-wrap" },
  msgOurs: { background: "#EEF2FF", borderColor: "#E0E7FF" },
  msgWho: { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#94A3B8", marginBottom: 3 },
  fine: { margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.6, color: "#94A3B8" },
};
