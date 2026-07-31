"use client";

/**
 * Testimonials, from either of the two routes in.
 *
 * ADDED BY YOU: copy the company typed about itself. The page says so, because
 * the public page says so, and an employer should learn that here rather than
 * after publishing.
 *
 * WRITTEN BY THE CLIENT: an invitation the client answered without needing an
 * account. Those cannot be edited or deleted by the company — only hidden —
 * which is exactly what makes them worth more than the first kind. The UI
 * offers the buttons that exist and not the ones that don't.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerSection";

type Testimonial = {
  id: string;
  origin: "COMPANY" | "INVITED";
  quote: string;
  authorName: string;
  authorRole: string | null;
  authorCompany: string | null;
  authorUrl: string | null;
  rating: number | null;
  visible: boolean;
};

/** Every optional field is "" rather than null in the draft: a controlled
 *  input can't take null, and mapping at the edges beats mapping at each of
 *  the four call sites. */
type Invite = { id: string; email: string; clientLabel: string | null; createdAt: string; expiresAt: string; expired: boolean };

type Draft = {
  id: string | null;
  quote: string;
  authorName: string;
  authorRole: string;
  authorCompany: string;
  authorUrl: string;
  rating: number;
  visible: boolean;
};

const BLANK: Draft = { id: null, quote: "", authorName: "", authorRole: "", authorCompany: "", authorUrl: "", rating: 0, visible: true };

const toDraft = (t: Testimonial): Draft => ({
  id: t.id,
  quote: t.quote,
  authorName: t.authorName,
  authorRole: t.authorRole ?? "",
  authorCompany: t.authorCompany ?? "",
  authorUrl: t.authorUrl ?? "",
  rating: t.rating ?? 0,
  visible: t.visible,
});

export default function TestimonialsClient() {
  const [items, setItems] = useState<Testimonial[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; url: string; emailed: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/company/testimonials", { cache: "no-store" });
    if (res.status === 401) { setGate("auth"); setItems([]); return; }
    if (res.status === 409) { setGate("company"); setItems([]); return; }
    if (!res.ok) { setError("Couldn't load your testimonials."); setItems([]); return; }
    setItems((await res.json()).testimonials);
    const inv = await fetch("/api/company/testimonials/invite", { cache: "no-store" });
    if (inv.ok) setInvites((await inv.json()).invites);
  }, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError(null); setLastLink(null);
    try {
      const res = await fetch("/api/company/testimonials/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, clientLabel: inviteLabel }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't send that request.");
      setLastLink({ email: inviteEmail, url: d.url, emailed: d.emailed });
      setInviteEmail(""); setInviteLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that request.");
    } finally {
      setSending(false);
    }
  }

  async function withdraw(i: Invite) {
    setBusyId(i.id);
    try {
      const res = await fetch(`/api/company/testimonials/invite?id=${encodeURIComponent(i.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't withdraw that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't withdraw that.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVisible(t: Testimonial) {
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/company/testimonials/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: !t.visible }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't change that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change that.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(draft.id ? `/api/company/testimonials/${draft.id}` : "/api/company/testimonials", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, rating: draft.rating || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save that.");
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: Testimonial) {
    if (!window.confirm(`Delete the quote from ${t.authorName}?`)) return;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/company/testimonials/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't delete that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that.");
    } finally {
      setBusyId(null);
    }
  }

  if (gate) return <EmployerGate title="Testimonials" reason={gate} what="testimonials" />;

  return (
    <EmployerSection
      title="Testimonials"
      subtitle="What your clients say about working with you."
      actions={!draft && <button type="button" style={ES.btn} onClick={() => setDraft({ ...BLANK })}>Add a testimonial</button>}
    >
      <div style={{ ...ES.notice, marginBottom: 20 }}>
        A quote <b>you</b> type is labelled on your page as supplied by you, and carries no review markup — nobody has
        checked it. A quote your <b>client</b> writes through an invitation is labelled as theirs, and you can hide it
        but not edit it. That difference is the whole reason the second kind is worth asking for.
      </div>

      {error && <div style={ES.error}>{error}</div>}

      <div style={{ ...ES.card, marginBottom: 22 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>Ask a client to write one</h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.8, color: "#64748B", lineHeight: 1.65 }}>
          They get an email with a link, write it in their own words, and don&apos;t need a Topezia account. You can
          hide what comes back, but you can&apos;t change it — which is what makes it mean something.
        </p>
        <form onSubmit={sendInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...ES.input, maxWidth: 280 }} type="email" required value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)} placeholder="client@theircompany.com" />
          <input style={{ ...ES.input, maxWidth: 200 }} value={inviteLabel} maxLength={120}
            onChange={(e) => setInviteLabel(e.target.value)} placeholder="Their name (for your list)" />
          <button type="submit" style={{ ...ES.btn, opacity: sending ? 0.6 : 1 }} disabled={sending}>
            {sending ? "Sending…" : "Send request"}
          </button>
        </form>
      </div>

      {lastLink && (
        <div style={{ ...ES.notice, marginBottom: 22 }}>
          {lastLink.emailed
            ? <>Request sent to <b>{lastLink.email}</b>. If it doesn&apos;t arrive, send them this link directly:</>
            : <>We couldn&apos;t deliver the email just now, but the request is live. Send <b>{lastLink.email}</b> this link yourself:</>}
          <div style={S.linkBox}>{lastLink.url}</div>
        </div>
      )}

      {invites.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={S.h2}>Waiting on</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {invites.map((i) => (
              <div key={i.id} style={{ ...ES.card, display: "flex", gap: 14, alignItems: "center", padding: 13, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ fontSize: 13.5 }}>{i.clientLabel || i.email}</b>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                    {i.clientLabel ? `${i.email} · ` : ""}asked {fmtDate(i.createdAt)}
                    {i.expired ? " · expired" : ` · expires ${fmtDate(i.expiresAt)}`}
                  </div>
                </div>
                <button type="button" style={{ ...ES.btnGhost, opacity: busyId === i.id ? 0.6 : 1 }} disabled={busyId === i.id} onClick={() => withdraw(i)}>
                  {i.expired ? "Clear" : "Withdraw"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {draft && (
        <div style={{ ...ES.card, marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>{draft.id ? "Edit testimonial" : "New testimonial"}</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={ES.label}>The quote</label>
              <textarea style={{ ...ES.input, minHeight: 110, resize: "vertical", lineHeight: 1.65 }}
                value={draft.quote} maxLength={1200}
                onChange={(e) => setDraft({ ...draft, quote: e.target.value })}
                placeholder="They rebuilt our whole brand in six weeks and we sold out the first run." />
            </div>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={ES.label}>Who said it</label>
                <input style={ES.input} value={draft.authorName} maxLength={120}
                  onChange={(e) => setDraft({ ...draft, authorName: e.target.value })} placeholder="Dana Whitmore" />
              </div>
              <div>
                <label style={ES.label}>Their role</label>
                <input style={ES.input} value={draft.authorRole} maxLength={120}
                  onChange={(e) => setDraft({ ...draft, authorRole: e.target.value })} placeholder="Founder" />
              </div>
              <div>
                <label style={ES.label}>Their company</label>
                <input style={ES.input} value={draft.authorCompany} maxLength={120}
                  onChange={(e) => setDraft({ ...draft, authorCompany: e.target.value })} placeholder="Sagebrush Outfitters" />
              </div>
              <div>
                <label style={ES.label}>Their website (optional)</label>
                <input style={ES.input} value={draft.authorUrl} maxLength={300}
                  onChange={(e) => setDraft({ ...draft, authorUrl: e.target.value })} placeholder="sagebrush.com" />
              </div>
            </div>
            <div>
              <label style={ES.label}>Rating (optional)</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setDraft({ ...draft, rating: draft.rating === n ? 0 : n })}
                    style={{ ...S.star, color: n <= draft.rating ? "#F59E0B" : "#CBD5E1" }} aria-label={`${n} stars`}>★</button>
                ))}
                {draft.rating > 0 && (
                  <button type="button" style={{ ...ES.btnGhost, padding: "5px 10px" }} onClick={() => setDraft({ ...draft, rating: 0 })}>Clear</button>
                )}
              </div>
            </div>
            <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, color: "#334155" }}>
              <input type="checkbox" checked={draft.visible} onChange={(e) => setDraft({ ...draft, visible: e.target.checked })} />
              Show this on the public company page
            </label>
            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="button" style={{ ...ES.btn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" style={ES.btnGhost} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {!items && <p style={ES.empty}>Loading…</p>}
      {items && items.length === 0 && !draft && (
        <div style={ES.card}><p style={ES.empty}>No testimonials yet.</p></div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(items ?? []).map((t) => (
          <div key={t.id} style={ES.card}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                {t.rating != null && (
                  <div style={{ color: "#F59E0B", fontSize: 14, letterSpacing: 1, marginBottom: 6 }}>
                    {"★".repeat(t.rating)}<span style={{ color: "#E2E8F0" }}>{"★".repeat(5 - t.rating)}</span>
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "#334155" }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 9 }}>
                  <b style={{ color: "#0F172A" }}>{t.authorName}</b>
                  {[t.authorRole, t.authorCompany].filter(Boolean).length > 0 && ` — ${[t.authorRole, t.authorCompany].filter(Boolean).join(", ")}`}
                  {t.origin === "INVITED" && <span style={{ ...ES.pillLive, marginLeft: 9 }}>Written by the client</span>}
                  {!t.visible && <span style={{ ...ES.pillDraft, marginLeft: 9 }}>Hidden</span>}
                </div>
              </div>
              <div style={{ flex: "none", display: "flex", gap: 8 }}>
                {t.origin === "INVITED" ? (
                  // No Edit and no Delete: the API refuses both, and offering a
                  // button that returns 403 is a worse experience than not
                  // offering it. Hiding is the control that actually exists.
                  <button type="button" style={{ ...ES.btnGhost, opacity: busyId === t.id ? 0.6 : 1 }} disabled={busyId === t.id} onClick={() => toggleVisible(t)}>
                    {t.visible ? "Hide" : "Show"}
                  </button>
                ) : (
                  <>
                    <button type="button" style={ES.btnGhost} onClick={() => { setDraft(toDraft(t)); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                    <button type="button" style={{ ...ES.btnDanger, opacity: busyId === t.id ? 0.6 : 1 }} disabled={busyId === t.id} onClick={() => remove(t)}>Delete</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </EmployerSection>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const S: Record<string, CSSProperties> = {
  h2: { fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#0F172A" },
  linkBox: { marginTop: 9, background: "#fff", border: "1px solid #BAE6FD", borderRadius: 8, padding: "8px 10px", fontSize: 12, wordBreak: "break-all", fontFamily: "ui-monospace, monospace", color: "#0F172A" },
  star: { background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 },
};
