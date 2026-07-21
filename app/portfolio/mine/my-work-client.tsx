"use client";

/**
 * Your own work — published AND drafts.
 *
 * This exists because drafts were otherwise unreachable: saving one and
 * navigating away left no route back to it. The public grid only lists
 * published pieces, and slugs carry a random suffix precisely so they can't be
 * guessed, so without this page a draft was effectively lost.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, FONT, Icon } from "@/app/_components/ui";
import { categoryLabel } from "@/lib/portfolio/categories";

type Item = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  coverUrl: string | null;
  mediaCount: number;
  updatedAt: string;
};

export default function MyWorkClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => (r.ok ? r.json() : { portfolios: [] }))
      .then((d) => setItems(d.portfolios ?? []))
      .catch(() => setItems([]));
  }, []);

  async function remove(item: Item) {
    // Deleting removes the images from storage too and cannot be undone, so it
    // asks first — this is the member's own work, not a list row.
    if (!window.confirm(`Delete “${item.title}”? This also removes its images and can't be undone.`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => (prev ? prev.filter((x) => x.id !== item.id) : prev));
    } catch {
      setError("Couldn't delete that. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={S.head}>
        <div>
          <h1 style={S.h1}>My work</h1>
          <p style={S.sub}>Everything you&apos;ve added. Drafts are private until you publish them.</p>
        </div>
        <Link href="/portfolio/new" style={S.add}>Add work</Link>
      </div>

      {error && <p style={S.error}>{error}</p>}

      {items === null && <p style={{ color: C.mut, fontSize: 14 }}>Loading…</p>}

      {items !== null && items.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nothing here yet</div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
            Add a piece of work and it gets its own public page you can share with anyone — no account needed to view it.
          </p>
          <Link href="/portfolio/new" style={S.add}>Add your first piece</Link>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(items ?? []).map((it) => (
          <div key={it.id} style={S.row}>
            <div style={S.thumb}>
              {it.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <Icon name="image" size={18} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Link href={`/portfolio/${it.slug}`} style={S.title}>{it.title}</Link>
                <span style={it.status === "PUBLISHED" ? S.pubTag : S.draftTag}>
                  {it.status === "PUBLISHED" ? "Published" : "Draft"}
                </span>
              </div>
              <div style={S.meta}>
                {categoryLabel(it.category)} · {it.mediaCount} {it.mediaCount === 1 ? "item" : "items"} · updated{" "}
                {new Date(it.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
            </div>

            <div style={S.actions}>
              <Link href={`/portfolio/${it.slug}/edit`} style={S.editBtn}>Edit</Link>
              <button type="button" onClick={() => remove(it)} disabled={busyId === it.id} style={S.delBtn}>
                {busyId === it.id ? "…" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  head: { display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 24, fontFamily: FONT },
  h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: "0 0 4px" },
  sub: { color: C.mut, fontSize: 14, margin: 0, lineHeight: 1.55 },
  add: { marginLeft: "auto", background: GRAD, color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" },
  empty: { border: `1px dashed ${C.line}`, borderRadius: 16, padding: "40px 26px", textAlign: "center", background: "#fff" },
  row: { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 12, flexWrap: "wrap" },
  thumb: { width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: "#F1F5F9", display: "grid", placeItems: "center", color: C.mut, flex: "none" },
  title: { fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: "none" },
  meta: { fontSize: 12.5, color: C.mut, marginTop: 4 },
  pubTag: { fontSize: 11, fontWeight: 700, color: "#047857", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 999, padding: "3px 9px" },
  draftTag: { fontSize: 11, fontWeight: 700, color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 999, padding: "3px 9px" },
  actions: { display: "flex", gap: 8, flex: "none" },
  editBtn: { border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: "none" },
  delBtn: { border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b42318", background: "#fff", cursor: "pointer", fontFamily: "inherit" },
  error: { color: "#b42318", fontSize: 13.5, marginBottom: 14 },
};
