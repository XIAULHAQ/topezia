"use client";

/**
 * The weekly review surface. Open errors on top (newest activity first, with
 * how many times and where), a Resolve button per row and a note field for
 * "what was done"; resolved ones below with a single Clear. That is the whole
 * loop Brandon asked for: checked weekly, fixed, cleared once fixed.
 *
 * A resolved error that fires again comes back to the top on its own
 * (lib/errors/log.ts reopens it) with its old note still attached, so a
 * regression is visible as one.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import HqShell from "../HqShell";

type Row = {
  id: string; source: string; message: string; stack: string | null; path: string | null;
  meta: Record<string, unknown> | null; count: number; status: string; note: string | null;
  firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null;
};

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function ErrorLogClient() {
  const [open, setOpen] = useState<Row[] | null>(null);
  const [resolved, setResolved] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/hq/errors", { cache: "no-store" });
    if (!r.ok) { setErr("Couldn't load the log."); setOpen([]); return; }
    const d = await r.json();
    setOpen(d.open ?? []); setResolved(d.resolved ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key); setErr(null);
    try {
      const r = await fetch("/api/hq/errors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      await load();
    } catch { setErr("That didn't save — try again."); } finally { setBusy(null); }
  }
  async function clearResolved() {
    if (!confirm(`Delete ${resolved.length} resolved error${resolved.length === 1 ? "" : "s"} from the log?`)) return;
    setBusy("clear");
    try {
      const r = await fetch("/api/hq/errors", { method: "DELETE" });
      if (!r.ok) throw new Error();
      await load();
    } catch { setErr("Couldn't clear — try again."); } finally { setBusy(null); }
  }

  const openCount = open?.length ?? 0;

  return (
    <HqShell
      title="Error log"
      subtitle="Everything the product hit, one row per distinct failure. Review weekly: fix, resolve with a note, then clear. Anything resolved that fires again reopens itself."
      counts={{ errors: openCount }}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          {openCount > 0 && <button type="button" disabled={busy !== null} onClick={() => patch({ all: "RESOLVED" }, "all")} style={S.ghost}>Resolve all open</button>}
          {resolved.length > 0 && <button type="button" disabled={busy !== null} onClick={clearResolved} style={S.danger}>Clear {resolved.length} resolved</button>}
        </div>
      }
    >
      {err && <div style={S.err}>{err}</div>}
      <section style={{ marginBottom: 34 }}>
        <h2 style={S.h2}>Open <span style={S.pill}>{openCount}</span></h2>
        {open === null ? <p style={S.mut}>Loading…</p>
          : open.length === 0 ? <p style={S.mut}>Nothing open. Either it has been a clean week, or the reporters aren&apos;t reaching the log — the digest email says which.</p>
          : open.map((r) => (
            <div key={r.id} style={S.card}>
              <div style={S.rowTop}>
                <span style={{ ...S.src, background: r.source === "client" ? "#FEF3C7" : r.source === "api" ? "#DBEAFE" : "#F1F5F9" }}>{r.source}</span>
                <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={S.msg} title="Show stack">{r.message}</button>
                <span style={S.count}>×{r.count}</span>
              </div>
              <div style={S.metaRow}>
                {r.path && <code style={S.code}>{r.path}</code>}
                <span>last {ago(r.lastSeenAt)}</span>
                <span>· first {ago(r.firstSeenAt)}</span>
                {r.note && <span style={{ color: "#B45309" }}>· previously: {r.note}</span>}
              </div>
              {expanded === r.id && (
                <pre style={S.pre}>{r.stack ?? "(no stack)"}{r.meta ? `\n\n${JSON.stringify(r.meta, null, 2)}` : ""}</pre>
              )}
              <div style={S.actions}>
                <input placeholder="What was done (optional)" value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} style={S.input} />
                <button type="button" disabled={busy !== null} onClick={() => patch({ id: r.id, status: "RESOLVED", note: notes[r.id] ?? "" }, r.id)} style={S.cta}>{busy === r.id ? "…" : "Resolve"}</button>
              </div>
            </div>
          ))}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 style={S.h2}>Resolved <span style={S.pill}>{resolved.length}</span></h2>
          {resolved.map((r) => (
            <div key={r.id} style={{ ...S.card, opacity: 0.75 }}>
              <div style={S.rowTop}>
                <span style={S.src}>{r.source}</span>
                <span style={{ ...S.msg, textDecoration: "line-through", cursor: "default" }}>{r.message}</span>
                <span style={S.count}>×{r.count}</span>
              </div>
              <div style={S.metaRow}>
                {r.path && <code style={S.code}>{r.path}</code>}
                <span>resolved {r.resolvedAt ? ago(r.resolvedAt) : ""}</span>
                {r.note && <span>· {r.note}</span>}
                <button type="button" disabled={busy !== null} onClick={() => patch({ id: r.id, status: "OPEN" }, r.id)} style={S.link}>Reopen</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </HqShell>
  );
}

const S: Record<string, CSSProperties> = {
  h2: { fontSize: 15, fontWeight: 800, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 },
  pill: { fontSize: 11, fontWeight: 700, background: "#F1F5F9", color: "#475569", borderRadius: 999, padding: "1px 8px" },
  mut: { color: "#64748B", fontSize: 13.5 },
  err: { background: "#FEF2F2", color: "#B42318", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 14px", marginBottom: 10 },
  rowTop: { display: "flex", alignItems: "center", gap: 10 },
  src: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", color: "#334155", flex: "none", textTransform: "uppercase" },
  msg: { flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "#0F172A", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  count: { fontSize: 12.5, fontWeight: 700, color: "#64748B", flex: "none" },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#64748B", marginTop: 6 },
  code: { fontSize: 11.5, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "1px 6px", color: "#334155" },
  pre: { marginTop: 10, background: "#0F172A", color: "#E2E8F0", borderRadius: 10, padding: 12, fontSize: 11.5, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320 },
  actions: { display: "flex", gap: 8, marginTop: 10 },
  input: { flex: 1, border: "1px solid #E2E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit" },
  cta: { border: "none", background: "#4F46E5", color: "#fff", fontWeight: 700, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  ghost: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  danger: { background: "#fff", border: "1px solid #FECACA", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#B42318", cursor: "pointer", fontFamily: "inherit" },
  link: { background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "#4F46E5", cursor: "pointer", fontFamily: "inherit" },
};
