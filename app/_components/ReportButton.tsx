"use client";

/**
 * "Report this page" — the member-facing half of the spam controls.
 *
 * Deliberately quiet. This is a safety control, not a call to action: it sits
 * at the bottom of a page as small muted text, because making it prominent on
 * a stranger's profile invites use as a weapon rather than as a flag.
 *
 * The wording never promises removal, because a report removes nothing — it
 * queues the page for a person to look at (see app/api/report/route.ts for why
 * auto-hiding on N reports is the wrong design here). "We'll take a look" is
 * the whole commitment, and it is one we can actually keep.
 *
 * Works signed-out: the person best placed to notice an impersonated profile is
 * the one being impersonated, who has no reason to hold an account here.
 */
import { useState } from "react";
import type { CSSProperties } from "react";

const REASONS = [
  { id: "SPAM", label: "Spam or advertising" },
  { id: "IMPERSONATION", label: "Pretending to be someone else" },
  { id: "NOT_THEIR_WORK", label: "This isn't their work" },
  { id: "OFFENSIVE", label: "Offensive or abusive" },
  { id: "OTHER", label: "Something else" },
] as const;

/** Must stay in step with KINDS in app/api/report/route.ts. */
export type ReportKind = "PROFILE" | "PORTFOLIO" | "COMPANY" | "COMPANY_WORK" | "COMPANY_ARTICLE";

/** Name the thing, not "this page" — on a company page the reader can see a
 *  company, its work and its articles, and "this page" would be ambiguous. */
const DEFAULT_LABEL: Record<ReportKind, string> = {
  PROFILE: "Report this profile",
  PORTFOLIO: "Report this page",
  COMPANY: "Report this company",
  COMPANY_WORK: "Report this work",
  COMPANY_ARTICLE: "Report this article",
};

export default function ReportButton({
  kind,
  targetId,
  label,
}: {
  kind: ReportKind;
  targetId: string;
  /** Overrides the default wording. Rarely needed — the defaults below already
   *  name the thing being reported, which matters on a company page that
   *  carries several reportable things at once. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("SPAM");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit() {
    setState("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId, reason, note }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p style={S.done}>Thanks — we&apos;ll take a look.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={S.link}>
        {label ?? DEFAULT_LABEL[kind]}
      </button>
    );
  }

  return (
    <div style={S.panel}>
      <div style={S.head}>What&apos;s wrong with it?</div>
      <div style={{ display: "grid", gap: 7, margin: "10px 0 12px" }}>
        {REASONS.map((r) => (
          <label key={r.id} style={S.row}>
            <input
              type="radio"
              name="report-reason"
              value={r.id}
              checked={reason === r.id}
              onChange={() => setReason(r.id)}
            />
            <span>{r.label}</span>
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 600))}
        placeholder="Anything else we should know? (optional)"
        rows={3}
        style={S.note}
      />
      {state === "error" && <p style={S.err}>That didn&apos;t send. Try again in a moment.</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={submit} disabled={state === "sending"} style={S.send}>
          {state === "sending" ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={S.cancel}>
          Cancel
        </button>
      </div>
      {/* Says what actually happens next. A report that quietly did nothing,
          or that quietly hid someone, would both be worse than saying so. */}
      <p style={S.fine}>Reports go to a person, not an automatic filter. Nothing is hidden on the strength of one.</p>
    </div>
  );
}

const MUT = "#64748B";
const LINE = "#E2E8F0";

const S: Record<string, CSSProperties> = {
  link: { background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, color: MUT, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" },
  done: { margin: 0, fontSize: 12, color: MUT },
  panel: { border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, maxWidth: 420, background: "#fff" },
  head: { fontSize: 13, fontWeight: 700, color: "#0F172A" },
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", cursor: "pointer" },
  note: { width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13, resize: "vertical" },
  send: { border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#0F172A", cursor: "pointer" },
  cancel: { border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#334155", background: "#fff", cursor: "pointer" },
  err: { margin: "8px 0 0", fontSize: 12, color: "#B91C1C" },
  fine: { margin: "10px 0 0", fontSize: 11, color: MUT, lineHeight: 1.5 },
};
