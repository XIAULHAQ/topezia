"use client";

/**
 * Brands — which of your websites share one knowledge base.
 *
 * THE THING THIS SCREEN HAS TO MAKE OBVIOUS is that grouping two domains
 * merges what the chat knows. A shop and a marketing site in one brand give
 * one assistant that can answer about both; two agency clients in one brand
 * would let one client's chat quote the other's pages. So the copy says what
 * grouping DOES rather than naming a setting, and the plain-English line
 * under each brand is the whole explanation.
 *
 * DELIBERATELY INVISIBLE FOR ALMOST EVERYONE. A company with one website has
 * one brand it never needs to think about, and a control panel for a decision
 * with a single possible answer is noise. This renders only when there is
 * more than one website to arrange.
 */
import { useEffect, useState, type CSSProperties } from "react";

const SLATE = "#334155";
const MUT = "#64748B";
const LINE = "#E2E8F0";

type Site = { id: string; domain: string; enabled: boolean };
type Brand = { id: string; name: string; sites: Site[] };
type Data = { brands: Brand[]; unbranded: Site[] };

const chip: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${LINE}`,
  background: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, color: SLATE,
};

export default function BrandsCard({ siteCount, onChanged }: { siteCount: number; onChanged?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/company/brands", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch { /* the card simply doesn't render */ }
  }
  useEffect(() => { void load(); }, []);

  async function send(method: "POST" | "PATCH" | "DELETE", body?: unknown, query = "") {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/company/brands${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || `Failed (${res.status})`); return; }
      // PATCH and DELETE answer with the whole list; POST answers with the
      // new brand, so reload rather than guess at the merged shape.
      if (json.brands) setData(json); else await load();
      onChanged?.();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  // One website means one brand and nothing to decide.
  if (!data || siteCount < 2) return null;

  const all = [...data.brands, ...(data.unbranded.length ? [{ id: "", name: "Not in a brand", sites: data.unbranded }] : [])];
  const shared = data.brands.filter((b) => b.sites.length > 1).length;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", marginTop: 14, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: SLATE }}>Brands</div>
          <div style={{ fontSize: 12, color: MUT, marginTop: 3, lineHeight: 1.55, maxWidth: 560 }}>
            Websites in the same brand share what the chat knows — put your shop and your
            main site together and one assistant answers about both. Keep separate
            businesses in separate brands, or each one&apos;s chat could quote the other&apos;s pages.
          </div>
        </div>
        <button type="button" disabled={busy}
          onClick={() => { const n = window.prompt("Name the new brand"); if (n?.trim()) void send("POST", { name: n }); }}
          style={{ border: `1px dashed ${LINE}`, background: "#fff", color: SLATE, borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: busy ? "progress" : "pointer", fontFamily: "inherit" }}>
          + New brand
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {all.map((b) => (
          <div key={b.id || "none"} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {editing === b.id && b.id ? (
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) { void send("PATCH", { id: b.id, name: draft }); setEditing(null); }
                    if (e.key === "Escape") setEditing(null);
                  }}
                  onBlur={() => setEditing(null)}
                  style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "5px 9px", fontSize: 13, fontFamily: "inherit", color: SLATE }} />
              ) : (
                <button type="button" disabled={!b.id}
                  onClick={() => { setEditing(b.id); setDraft(b.name); }}
                  title={b.id ? "Rename" : undefined}
                  style={{ border: "none", background: "none", padding: 0, fontSize: 13, fontWeight: 700, color: b.id ? SLATE : MUT, cursor: b.id ? "pointer" : "default", fontFamily: "inherit" }}>
                  {b.name}
                </button>
              )}
              <span style={{ fontSize: 11.5, color: MUT }}>
                {b.sites.length === 0
                  ? "no websites yet"
                  : b.sites.length === 1
                    ? "1 website — answers from its own pages only"
                    : `${b.sites.length} websites — one shared knowledge base`}
              </span>
              {b.id && b.sites.length === 0 && (
                <button type="button" disabled={busy} onClick={() => void send("DELETE", undefined, `?id=${encodeURIComponent(b.id)}`)}
                  style={{ border: "none", background: "none", color: "#B91C1C", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                  Delete
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
              {b.sites.map((s) => (
                <span key={s.id} style={chip}>
                  {s.domain}{!s.enabled && <span style={{ color: "#94A3B8" }}>· off</span>}
                  {/* Moving is the only action, so it IS the control — no menu
                      to open, no mode to enter. Disabled when there is nowhere
                      else to go, which is honest about why nothing happens. */}
                  <select
                    value={b.id}
                    disabled={busy || data.brands.length < 2}
                    onChange={(e) => { if (e.target.value !== b.id) void send("PATCH", { siteId: s.id, brandId: e.target.value }); }}
                    aria-label={`Which brand ${s.domain} belongs to`}
                    style={{ border: "none", background: "none", color: MUT, fontSize: 11.5, fontFamily: "inherit", cursor: data.brands.length < 2 ? "default" : "pointer", maxWidth: 150 }}>
                    {!b.id && <option value="">Not in a brand</option>}
                    {data.brands.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </span>
              ))}
              {b.sites.length === 0 && (
                <span style={{ fontSize: 12, color: MUT }}>Move a website here using the menu on its chip.</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {shared === 0 && data.brands.length > 1 && (
        <p style={{ fontSize: 11.5, color: MUT, marginTop: 12, lineHeight: 1.5 }}>
          Every website is on its own right now, so each chat answers only from its own pages.
          Put two in the same brand if they are one business.
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
