"use client";

/**
 * Testimonials the company types in.
 *
 * The page says out loud what these are — quotes the company supplied, which
 * Topezia has not verified — because the public page says the same thing, and
 * an employer should find that out here rather than after publishing.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerTabs";

type Testimonial = {
  id: string;
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

  const load = useCallback(async () => {
    const res = await fetch("/api/company/testimonials", { cache: "no-store" });
    if (res.status === 401) { setGate("auth"); setItems([]); return; }
    if (res.status === 409) { setGate("company"); setItems([]); return; }
    if (!res.ok) { setError("Couldn't load your testimonials."); setItems([]); return; }
    setItems((await res.json()).testimonials);
  }, []);

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
        These are quotes <b>you</b> enter, so your company page labels them as supplied by you and Topezia doesn&apos;t
        mark them up as verified reviews. If you want something a reader can check, ask the client for a{" "}
        <a href="/profile" style={{ color: "#075985", fontWeight: 700 }}>recommendation on a Topezia profile</a> — those
        are written by the person themselves, signed in, through a link you can&apos;t edit.
      </div>

      {error && <div style={ES.error}>{error}</div>}

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
                  {!t.visible && <span style={{ ...ES.pillDraft, marginLeft: 9 }}>Hidden</span>}
                </div>
              </div>
              <div style={{ flex: "none", display: "flex", gap: 8 }}>
                <button type="button" style={ES.btnGhost} onClick={() => { setDraft(toDraft(t)); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button type="button" style={{ ...ES.btnDanger, opacity: busyId === t.id ? 0.6 : 1 }} disabled={busyId === t.id} onClick={() => remove(t)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </EmployerSection>
  );
}

const S: Record<string, CSSProperties> = {
  star: { background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 },
};
