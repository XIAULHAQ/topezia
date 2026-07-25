"use client";

/**
 * "Invite industry experts to rate and review your work" — the owner's button
 * on a work's own page.
 *
 * Same machinery as the profile panel, pre-scoped to THIS piece: it mints a
 * standing /r/{token} link that the owner sends themselves. Topezia never
 * emails anyone on a member's behalf, which is what keeps us from being
 * turned into a way to mail strangers — so the product of this button is a
 * link on the clipboard, not a message in flight.
 *
 * One link serves everyone: it keeps working until the owner turns it off,
 * and each signed-in account can answer it once.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { C, Icon } from "@/app/_components/ui";
import { WORK_REVIEW_NOTES } from "@/lib/endorsements/notes";

export default function InviteReviewers({ portfolioId, workTitle }: { portfolioId: string; workTitle: string }) {
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [note, setNote] = useState("");
  const [noteIdx, setNoteIdx] = useState(0);
  // Once the owner types their own words we never overwrite them.
  const [noteTouched, setNoteTouched] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || noteTouched) return;
    setNote(WORK_REVIEW_NOTES[noteIdx % WORK_REVIEW_NOTES.length]);
  }, [open, noteIdx, noteTouched]);

  function copy(url: string) {
    navigator.clipboard?.writeText(url)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
      .catch(() => {});
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "REVIEW", portfolioId, sentToLabel: sentTo, requestNote: note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't create that invite.");
      setLink(d.link);
      copy(d.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that invite.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLink(null); setSentTo(""); setNoteTouched(false); setNoteIdx((i) => i + 1); setCopied(false);
  }

  if (!open) {
    return (
      <div style={S.pitch}>
        <div style={{ minWidth: 0 }}>
          <div style={S.pitchHead}>Invite industry experts to rate and review your work</div>
          <p style={S.pitchBody}>
            A stranger deciding whether to hire you is reading someone else&rsquo;s opinion, not yours. Send a private
            link to a client or a peer in your field — they write it in their own words, and you can never edit it.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} style={S.cta}>
          <Icon name="star" size={16} />
          Invite a reviewer
        </button>
      </div>
    );
  }

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardTitle}>Invite an expert to review &ldquo;{workTitle}&rdquo;</span>
        <button type="button" onClick={() => { setOpen(false); reset(); }} style={S.close} aria-label="Close">×</button>
      </div>

      {link ? (
        <>
          <p style={S.done}>
            Link ready{copied ? " and copied" : ""} — send it yourself, to as many people as you like. Each person signs in and writes once; the link works until you turn it off from your profile.
          </p>
          <div style={S.linkRow}>
            <input readOnly value={link} style={S.linkInput} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => copy(link)} style={S.copyBtn}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p style={S.fine}>
            They&rsquo;ll be asked to sign in before it posts, so the review comes from an account that isn&rsquo;t yours.
            Manage everything you&rsquo;ve requested on <a href="/profile" style={S.inlineLink}>your profile</a>.
          </p>
          <button type="button" onClick={reset} style={S.secondary}>Create another link</button>
        </>
      ) : (
        <>
          <label style={S.label} htmlFor="ir-who">Who are you sending it to?</label>
          <input
            id="ir-who"
            value={sentTo}
            onChange={(e) => setSentTo(e.target.value)}
            placeholder="e.g. Sara at Acme (only you see this)"
            style={S.input}
            maxLength={80}
          />

          <div style={S.labelRow}>
            <label style={S.label} htmlFor="ir-note">A line for them</label>
            <button type="button" onClick={() => { setNoteTouched(false); setNoteIdx((i) => i + 1); }} style={S.suggest}>
              Suggest another
            </button>
          </div>
          <textarea
            id="ir-note"
            value={note}
            onChange={(e) => { setNote(e.target.value); setNoteTouched(true); }}
            rows={3}
            style={S.textarea}
            maxLength={300}
          />

          {error && <div style={S.error}>{error}</div>}

          <button type="button" onClick={create} disabled={busy} style={{ ...S.cta, width: "100%", marginTop: 12 }}>
            {busy ? "Creating…" : "Create the link"}
          </button>
        </>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  pitch: {
    display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between",
    background: "#FAFAFF", border: "1px solid #E0E7FF", borderRadius: 14, padding: "18px 20px",
  },
  pitchHead: { fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 },
  pitchBody: { fontSize: 13, lineHeight: 1.65, color: C.slate, margin: 0, maxWidth: 520 },
  cta: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    border: "none", background: C.c1, color: "#fff", borderRadius: 12,
    padding: "12px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", flex: "none", whiteSpace: "nowrap",
  },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", maxWidth: 560 },
  cardHead: { display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between", marginBottom: 14 },
  cardTitle: { fontSize: 14.5, fontWeight: 700, color: C.ink, lineHeight: 1.4 },
  close: { border: "none", background: "none", fontSize: 22, lineHeight: 1, color: C.mut, cursor: "pointer", padding: 0, flex: "none" },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 },
  labelRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 14 },
  suggest: { border: "none", background: "none", color: C.c1, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 },
  input: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: C.ink, boxSizing: "border-box" },
  textarea: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: C.ink, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box" },
  error: { marginTop: 10, fontSize: 12.5, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px" },
  done: { fontSize: 13.5, color: C.slate, lineHeight: 1.65, margin: "0 0 12px" },
  linkRow: { display: "flex", gap: 8, alignItems: "stretch" },
  linkInput: { flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontFamily: "ui-monospace, monospace", color: C.slate, background: "#F8FAFC" },
  copyBtn: { border: `1px solid ${C.line}`, background: "#fff", color: C.slate, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "none" },
  fine: { fontSize: 11.5, color: C.mut, lineHeight: 1.6, margin: "12px 0 0" },
  inlineLink: { color: C.c1, fontWeight: 600, textDecoration: "none" },
  secondary: { marginTop: 14, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
