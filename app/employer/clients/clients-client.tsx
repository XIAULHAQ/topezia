"use client";

/**
 * Client logos, each with an optional link to that client's website.
 *
 * The name is required even when there's a logo: a logo alone is invisible to
 * a screen reader and to a search engine, and "an image with a link and no
 * text" is the exact shape of a link farm.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerTabs";

type ClientRow = { id: string; name: string; websiteUrl: string | null; logoPath: string | null };
type Draft = { id: string | null; name: string; websiteUrl: string; logoPath: string | null };

const BLANK: Draft = { id: null, name: "", websiteUrl: "", logoPath: null };

const logoUrl = (path: string) => {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/logos/${path}`;
};

export default function ClientsClient() {
  const [items, setItems] = useState<ClientRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/company/clients", { cache: "no-store" });
    if (res.status === 401) { setGate("auth"); setItems([]); return; }
    if (res.status === 409) { setGate("company"); setItems([]); return; }
    if (!res.ok) { setError("Couldn't load your clients."); setItems([]); return; }
    setItems((await res.json()).clients);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pickLogo(file: File) {
    setUploading(true); setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/company/image?kind=client", { method: "POST", body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't upload that logo.");
      setDraft((x) => (x ? { ...x, logoPath: d.path } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that logo.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(draft.id ? `/api/company/clients/${draft.id}` : "/api/company/clients", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
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

  async function remove(c: ClientRow) {
    if (!window.confirm(`Remove ${c.name} from your client list?`)) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/company/clients/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't remove that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that.");
    } finally {
      setBusyId(null);
    }
  }

  if (gate) return <EmployerGate title="Clients" reason={gate} what="your client list" />;

  return (
    <EmployerSection
      title="Clients"
      subtitle="Who you've worked with. Logos appear on your public company page, each linking to that client's own site."
      actions={!draft && <button type="button" style={ES.btn} onClick={() => setDraft({ ...BLANK })}>Add a client</button>}
    >
      {error && <div style={ES.error}>{error}</div>}

      {draft && (
        <div style={{ ...ES.card, marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>{draft.id ? "Edit client" : "New client"}</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={ES.label}>Client name</label>
                <input style={ES.input} value={draft.name} maxLength={120}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Sagebrush Outfitters" />
              </div>
              <div>
                <label style={ES.label}>Their website</label>
                <input style={ES.input} value={draft.websiteUrl} maxLength={300}
                  onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })} placeholder="sagebrush.com" />
              </div>
            </div>
            <div>
              <label style={ES.label}>Logo</label>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {draft.logoPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl(draft.logoPath)} alt="" style={S.logo} />
                )}
                <label style={{ ...ES.btnGhost, display: "inline-block" }}>
                  {draft.logoPath ? "Replace" : "Upload"} logo
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickLogo(f); }} />
                </label>
                {draft.logoPath && (
                  <button type="button" style={ES.btnGhost} onClick={() => setDraft({ ...draft, logoPath: null })}>Remove</button>
                )}
                {uploading && <span style={S.hint}>Uploading…</span>}
              </div>
              <p style={S.hint}>PNG with a transparent background works best. Up to 2MB.</p>
            </div>
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
        <div style={ES.card}><p style={ES.empty}>No clients listed yet.</p></div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(items ?? []).map((c) => (
          <div key={c.id} style={{ ...ES.card, display: "flex", gap: 16, alignItems: "center", padding: 14 }}>
            <div style={S.rowLogo}>
              {c.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl(c.logoPath)} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 800, color: "#94A3B8" }}>{c.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{c.name}</b>
              <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, wordBreak: "break-all" }}>
                {c.websiteUrl ? c.websiteUrl.replace(/^https?:\/\//, "") : "No link"}
              </div>
            </div>
            <div style={{ flex: "none", display: "flex", gap: 8 }}>
              <button type="button" style={ES.btnGhost} onClick={() => { setDraft({ id: c.id, name: c.name, websiteUrl: c.websiteUrl ?? "", logoPath: c.logoPath }); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
              <button type="button" style={{ ...ES.btnDanger, opacity: busyId === c.id ? 0.6 : 1 }} disabled={busyId === c.id} onClick={() => remove(c)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </EmployerSection>
  );
}

const S: Record<string, CSSProperties> = {
  hint: { margin: "6px 0 0", fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5 },
  logo: { width: 90, height: 54, objectFit: "contain", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", padding: 4 },
  rowLogo: { flex: "none", width: 72, height: 44, borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "grid", placeItems: "center", padding: 4 },
};
