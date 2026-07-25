"use client";

/**
 * Publications & Research on the member's own profile — the ResearchGate-
 * shaped section: journal articles, conference papers, books, theses.
 *
 * Self-contained like EndorsementsPanel: fetches and writes its own API
 * rather than threading through the profile field-edit system, because a
 * publication is a structured row (type, identifiers, co-authors), not a
 * profile field.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { C, GRAD } from "@/app/_components/ui";
import {
  PUBLICATION_LIMITS, PUBLICATION_TYPES, PUBLICATION_TYPE_LABELS, VENUE_LABELS,
  type PublicationTypeId,
} from "@/lib/publications/doc";

type Pub = {
  id: string;
  type: PublicationTypeId;
  title: string;
  authors: string[];
  venue: string | null;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  url: string | null;
  abstract: string | null;
};

const EMPTY = {
  type: "JOURNAL_ARTICLE" as PublicationTypeId,
  title: "", authors: "", venue: "", year: "", doi: "", isbn: "", url: "", abstract: "",
};

export default function PublicationsPanel() {
  const [rows, setRows] = useState<Pub[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/publications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(d?.publications ?? []))
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const isBook = f.type === "BOOK" || f.type === "BOOK_CHAPTER";

  function startAdd() {
    setF(EMPTY); setEditingId(null); setError(null); setOpen(true);
  }
  function startEdit(p: Pub) {
    setF({
      type: p.type, title: p.title, authors: p.authors.join(", "),
      venue: p.venue ?? "", year: p.year ? String(p.year) : "",
      doi: p.doi ?? "", isbn: p.isbn ?? "", url: p.url ?? "", abstract: p.abstract ?? "",
    });
    setEditingId(p.id); setError(null); setOpen(true);
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const payload = {
        id: editingId ?? undefined,
        type: f.type,
        title: f.title,
        // Comma-separated in the form; the API stores a list.
        authors: f.authors.split(",").map((s) => s.trim()).filter(Boolean),
        venue: f.venue, year: f.year ? parseInt(f.year, 10) : null,
        doi: f.doi, isbn: f.isbn, url: f.url, abstract: f.abstract,
      };
      const res = await fetch("/api/publications", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save that.");
      setOpen(false); setF(EMPTY); setEditingId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setRows((cur) => cur?.filter((r) => r.id !== id) ?? cur);
    await fetch(`/api/publications?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  const set = (k: keyof typeof EMPTY) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: rows?.length || open ? 12 : 6 }}>
        <p style={{ fontSize: 12, color: C.mut, margin: 0, lineHeight: 1.5, flex: 1 }}>
          Papers, books and research you&apos;ve published — with the DOI or ISBN so anyone can look them up.
        </p>
        {!open && (
          <button type="button" onClick={startAdd} style={S.primary}>Add one</button>
        )}
      </div>

      {open && (
        <div style={S.form}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {PUBLICATION_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => set("type")(t)}
                style={{ ...S.typeBtn, background: f.type === t ? GRAD : "#fff", color: f.type === t ? "#fff" : C.slate, border: `1px solid ${f.type === t ? "transparent" : C.line}` }}>
                {PUBLICATION_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <input style={{ ...S.input, marginBottom: 8 }} placeholder="Title" value={f.title}
            onChange={(e) => set("title")(e.target.value.slice(0, PUBLICATION_LIMITS.title))} />
          <input style={{ ...S.input, marginBottom: 8 }} placeholder="Authors, comma-separated — as printed on the work" value={f.authors}
            onChange={(e) => set("authors")(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input style={{ ...S.input, flex: "2 1 200px" }} placeholder={VENUE_LABELS[f.type]} value={f.venue}
              onChange={(e) => set("venue")(e.target.value.slice(0, PUBLICATION_LIMITS.venue))} />
            <input style={{ ...S.input, flex: "1 1 90px" }} placeholder="Year" inputMode="numeric" value={f.year}
              onChange={(e) => set("year")(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            {isBook ? (
              <input style={{ ...S.input, flex: "1 1 160px" }} placeholder="ISBN" value={f.isbn}
                onChange={(e) => set("isbn")(e.target.value.slice(0, PUBLICATION_LIMITS.isbn))} />
            ) : (
              <input style={{ ...S.input, flex: "1 1 160px" }} placeholder="DOI — e.g. 10.1234/abcd" value={f.doi}
                onChange={(e) => set("doi")(e.target.value.slice(0, PUBLICATION_LIMITS.doi + 30))} />
            )}
            <input style={{ ...S.input, flex: "2 1 200px" }} placeholder="Link (https://…)" value={f.url}
              onChange={(e) => set("url")(e.target.value.slice(0, PUBLICATION_LIMITS.url))} />
          </div>
          <textarea style={{ ...S.input, resize: "vertical", lineHeight: 1.6 }} rows={3}
            placeholder="Abstract or a short description (optional)" value={f.abstract}
            onChange={(e) => set("abstract")(e.target.value.slice(0, PUBLICATION_LIMITS.abstract))} />

          {error && <p style={{ color: "#DC2626", fontSize: 12.5, fontWeight: 600, margin: "10px 0 0" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={save} disabled={busy || !f.title.trim()} style={{ ...S.primary, opacity: busy || !f.title.trim() ? 0.5 : 1 }}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add publication"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setEditingId(null); }} style={S.ghost}>Cancel</button>
          </div>
        </div>
      )}

      {rows === null && <p style={{ fontSize: 12.5, color: C.mut, margin: 0 }}>Loading…</p>}
      {rows !== null && rows.length === 0 && !open && (
        <p style={{ fontSize: 12.5, color: C.mut, margin: 0, lineHeight: 1.5 }}>
          Nothing here yet. If you&apos;ve published a paper, a thesis, or a book, it belongs on your profile.
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: open ? 12 : 0 }}>
          {rows.map((p) => (
            <div key={p.id} style={S.item}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                <span style={S.typeTag}>{PUBLICATION_TYPE_LABELS[p.type]}</span>
                {p.year && <span style={{ fontSize: 11.5, color: C.mut, fontWeight: 600 }}>{p.year}</span>}
                <div style={{ flex: 1 }} />
                <button type="button" onClick={() => startEdit(p)} style={S.linkBtn}>Edit</button>
                <button type="button" onClick={() => remove(p.id)} style={{ ...S.linkBtn, color: "#b42318" }}>Delete</button>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4 }}>{p.title}</div>
              {p.authors.length > 0 && <div style={{ fontSize: 12, color: C.slate, marginTop: 3 }}>{p.authors.join(", ")}</div>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, fontSize: 11.5, color: C.mut }}>
                {p.venue && <span style={{ fontWeight: 600, color: C.c1 }}>{p.venue}</span>}
                {p.doi && <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer" style={S.idLink}>DOI {p.doi}</a>}
                {p.isbn && <span>ISBN {p.isbn}</span>}
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={S.idLink}>View ↗</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  primary: { display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: GRAD, color: "#fff", borderRadius: 10, padding: "8px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "none" },
  ghost: { border: `1px solid ${C.line}`, background: "#fff", color: C.slate, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  typeBtn: { borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  form: { border: `1px solid ${C.line}`, borderRadius: 13, padding: 14, background: "#FBFCFE", marginBottom: 4 },
  input: { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  item: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px", background: "#fff" },
  typeTag: { fontSize: 10, fontWeight: 700, color: C.c1, background: "#EEF2FF", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: 0.3 },
  linkBtn: { background: "none", border: "none", color: C.c1, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 },
  idLink: { color: C.c1, fontWeight: 600, textDecoration: "none" },
};
