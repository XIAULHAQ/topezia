"use client";

/**
 * Requested recommendations & reviews, on the member's own profile.
 *
 * Two halves: what has come back (hide/show, never edit) and what is still
 * out (a link to copy, or delete). The copy-a-link model is deliberate —
 * Topezia sends no email on a member's behalf, so we can never be turned into
 * a way to mail strangers.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { C, GRAD, Icon } from "@/app/_components/ui";
import { ENDORSEMENT_LIMITS } from "@/lib/endorsements/doc";
import { NOTE_SUGGESTIONS } from "@/lib/endorsements/notes";

type Row = {
  id: string;
  kind: "RECOMMENDATION" | "REVIEW";
  status: "PENDING" | "SUBMITTED";
  sentToLabel: string | null;
  authorName: string | null;
  authorRole: string | null;
  text: string | null;
  rating: number | null;
  submittedAt: string | null;
  visible: boolean;
  link: string | null;
  expired: boolean;
  portfolio: { title: string; slug: string } | null;
};
type Work = { id: string; title: string; slug: string; thumb: string | null };

export default function EndorsementsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"RECOMMENDATION" | "REVIEW">("RECOMMENDATION");
  const [workId, setWorkId] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [note, setNote] = useState("");
  const [noteIdx, setNoteIdx] = useState(0);
  // True once the member types their own words — after that we never
  // overwrite them, not even when they switch kind.
  const [noteTouched, setNoteTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/endorsements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(d?.endorsements ?? []))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/endorsements/works").then((r) => (r.ok ? r.json() : null)).then((d) => setWorks(d?.works ?? [])).catch(() => {});
  }, [open]);

  // Seed the note with a suggestion — a blank box is where most requests die.
  // Only while it is untouched, so switching kind refreshes the suggestion but
  // never eats something the member wrote.
  useEffect(() => {
    if (!open || noteTouched) return;
    setNote(NOTE_SUGGESTIONS[kind][noteIdx % NOTE_SUGGESTIONS[kind].length]);
  }, [open, kind, noteIdx, noteTouched]);

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, portfolioId: kind === "REVIEW" ? workId : undefined, sentToLabel: sentTo, requestNote: note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't create that request.");
      setOpen(false); setSentTo(""); setNote(""); setWorkId(""); setNoteTouched(false); setNoteIdx((i) => i + 1);
      load();
      copy(d.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that request.");
    } finally {
      setBusy(false);
    }
  }

  function copy(link: string) {
    navigator.clipboard?.writeText(link).then(() => { setCopied(link); setTimeout(() => setCopied(null), 2500); }).catch(() => {});
  }

  async function setVisible(id: string, visible: boolean) {
    setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, visible } : r)) ?? cur);
    await fetch("/api/endorsements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, visible }) }).catch(() => {});
  }

  async function remove(id: string) {
    setRows((cur) => cur?.filter((r) => r.id !== id) ?? cur);
    await fetch(`/api/endorsements?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  if (!rows) return null;
  const received = rows.filter((r) => r.status === "SUBMITTED");
  const pending = rows.filter((r) => r.status === "PENDING");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: C.mut, flex: 1, lineHeight: 1.55, minWidth: 180 }}>
          Ask someone to write one themselves — you&apos;ll get a link to send them.
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} style={S.primary}>
          <Icon name="plus" size={14} />Request
        </button>
      </div>

      {open && (
        <div style={S.form}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["RECOMMENDATION", "REVIEW"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                style={{ ...S.kindBtn, background: kind === k ? GRAD : "#fff", color: kind === k ? "#fff" : C.slate, border: `1px solid ${kind === k ? "transparent" : C.line}` }}>
                {k === "REVIEW" ? "Review of a project" : "Recommendation"}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: C.mut, margin: "0 0 12px", lineHeight: 1.55 }}>
            {kind === "REVIEW"
              ? "About one piece of work — for clients who hired you for it."
              : "About you as a person to work with — for colleagues, managers or clients."}
          </p>

          {kind === "REVIEW" && (
            works.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "9px 12px", margin: "0 0 12px", lineHeight: 1.5 }}>
                A review needs a published portfolio piece to be about. <a href="/portfolio/new" style={{ color: "#9A3412", fontWeight: 700 }}>Add one first →</a>
              </p>
            ) : (
              <select value={workId} onChange={(e) => setWorkId(e.target.value)} style={{ ...S.input, cursor: "pointer", marginBottom: 10 }}>
                <option value="">Which piece of work?</option>
                {works.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            )
          )}

          <input style={{ ...S.input, marginBottom: 10 }} placeholder="Who's it for? e.g. Sara at Acme (only you see this)" value={sentTo} onChange={(e) => setSentTo(e.target.value.slice(0, ENDORSEMENT_LIMITS.sentToLabel))} />

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.slate }}>Your note to them</span>
            <span style={{ fontSize: 11, color: C.mut }}>— we&apos;ve written one, edit it freely</span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => { setNoteTouched(false); setNoteIdx((i) => i + 1); }} style={S.linkBtn}>
              Suggest another
            </button>
          </div>
          <textarea
            style={{ ...S.input, resize: "vertical", lineHeight: 1.6 }}
            rows={3}
            placeholder="A line to them — shown on the page they land on"
            value={note}
            onChange={(e) => { setNoteTouched(true); setNote(e.target.value.slice(0, ENDORSEMENT_LIMITS.requestNote)); }}
          />

          {error && <p style={{ color: "#DC2626", fontSize: 12.5, fontWeight: 600, margin: "10px 0 0" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <button type="button" onClick={create} disabled={busy || (kind === "REVIEW" && !workId)} style={{ ...S.primary, opacity: busy || (kind === "REVIEW" && !workId) ? 0.5 : 1 }}>
              {busy ? "Creating…" : "Create link"}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={S.ghost}>Cancel</button>
            <span style={{ fontSize: 11, color: C.mut, lineHeight: 1.45 }}>We&apos;ll copy a link — you send it however you like.</span>
          </div>
        </div>
      )}

      {received.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {received.map((r) => (
            <div key={r.id} style={{ ...S.item, opacity: r.visible ? 1 : 0.55 }}>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: C.slate, fontStyle: "italic" }}>&ldquo;{r.text}&rdquo;</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{r.authorName}</span>
                {r.authorRole && <span style={{ fontSize: 11.5, color: C.mut }}>{r.authorRole}</span>}
                {r.rating && <span style={{ fontSize: 11.5, color: C.c1, fontWeight: 700 }}>{"★".repeat(r.rating)}</span>}
                {r.portfolio && <span style={{ fontSize: 11, color: C.mut }}>on {r.portfolio.title}</span>}
                <span style={S.writtenTag}>written by them</span>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={() => setVisible(r.id, !r.visible)} style={S.linkBtn}>{r.visible ? "Hide" : "Show"}</button>
                <button type="button" onClick={() => remove(r.id)} style={{ ...S.linkBtn, color: "#b42318" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: C.mut, marginBottom: 7 }}>Waiting on a reply</div>
          <div style={{ display: "grid", gap: 7 }}>
            {pending.map((r) => (
              <div key={r.id} style={{ ...S.item, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "9px 12px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: r.expired ? C.mut : C.ink }}>
                  {r.sentToLabel || (r.kind === "REVIEW" ? "Review request" : "Recommendation request")}
                </span>
                {r.portfolio && <span style={{ fontSize: 11, color: C.mut }}>on {r.portfolio.title}</span>}
                {r.expired && <span style={{ fontSize: 10.5, color: "#9A3412", background: "#FFF7ED", borderRadius: 999, padding: "2px 8px", fontWeight: 700 }}>expired</span>}
                <div style={{ flex: 1 }} />
                {!r.expired && r.link && (
                  <button type="button" onClick={() => copy(r.link!)} style={S.linkBtn}>{copied === r.link ? "Copied ✓" : "Copy link"}</button>
                )}
                <button type="button" onClick={() => remove(r.id)} style={{ ...S.linkBtn, color: "#b42318" }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  primary: { display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: GRAD, color: "#fff", borderRadius: 10, padding: "8px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "none" },
  ghost: { border: `1px solid ${C.line}`, background: "#fff", color: C.slate, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  kindBtn: { borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  form: { border: `1px solid ${C.line}`, borderRadius: 13, padding: 14, background: "#FBFCFE" },
  input: { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  item: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px", background: "#fff" },
  writtenTag: { fontSize: 10, fontWeight: 700, color: "#0F6E56", background: "#E7F6EE", borderRadius: 999, padding: "2px 8px" },
  linkBtn: { background: "none", border: "none", color: C.c1, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 },
};
