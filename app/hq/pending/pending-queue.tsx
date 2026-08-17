"use client";

/**
 * The other half of "a missing role never blocks a posting".
 *
 * An employer who couldn't find their role posted under the category instead;
 * the posting is finished and held (migration 079) because with no role there
 * is nothing routing it to the right people. Each row here is a real job
 * somebody is waiting to fill, so the list is oldest-first and says how long
 * it has waited.
 *
 * Naming the missing role fixes more than the one posting: crawled jobs
 * resolve through the same table, so the next "Sous Chef" lands correctly on
 * its own.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import HqShell from "../HqShell";

type Row = {
  id: string; title: string; excerpt: string; company: string; createdAt: string;
  vertical: { id: string; slug: string; name: string }; skills: string[];
};
type Role = { slug: string; name: string; vertical: { slug: string; name: string } };

const waited = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return "today";
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

export default function PendingQueue() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/hq/pending", { cache: "no-store" });
    if (!r.ok) { setErr("Couldn't load the queue."); setRows([]); return; }
    const d = await r.json();
    setRows(d.pending ?? []); setRoles(d.roles ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function release(row: Row) {
    const roleSlug = pick[row.id] ?? "";
    const name = (newName[row.id] ?? "").trim();
    if (!roleSlug && !name) { setErr("Pick a role, or name the one we're missing."); return; }
    setBusy(row.id); setErr(null);
    try {
      const res = await fetch("/api/hq/pending", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleSlug ? { id: row.id, roleSlug } : { id: row.id, newRoleName: name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "");
      await load();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "That didn't work — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <HqShell
      title="Waiting on a category"
      subtitle="Finished postings we are holding because no role fits them yet. Attach a role — or name the one we're missing — and the posting goes live immediately. Oldest first; somebody is waiting to fill each of these."
      counts={{ pending: rows?.length ?? 0 }}
    >
      {err && <div style={S.err}>{err}</div>}
      {rows === null ? <p style={S.mut}>Loading…</p>
        : rows.length === 0 ? <p style={S.mut}>Nothing waiting. Every posting found a role.</p>
        : rows.map((r) => {
          const sameVertical = roles.filter((x) => x.vertical.slug === r.vertical.slug);
          const others = roles.filter((x) => x.vertical.slug !== r.vertical.slug);
          return (
            <div key={r.id} style={S.card}>
              <div style={S.top}>
                <span style={S.title}>{r.title}</span>
                <span style={S.cat}>{r.vertical.name}</span>
                <span style={S.age}>waiting since {waited(r.createdAt)}</span>
              </div>
              <div style={S.by}>{r.company}{r.skills.length > 0 && <> · {r.skills.slice(0, 6).join(", ")}</>}</div>
              <p style={S.excerpt}>{r.excerpt}…</p>
              <div style={S.actions}>
                <select
                  value={pick[r.id] ?? ""}
                  onChange={(e) => { setPick((p) => ({ ...p, [r.id]: e.target.value })); setNewName((n) => ({ ...n, [r.id]: "" })); }}
                  style={S.select}
                >
                  <option value="">Attach an existing role…</option>
                  {sameVertical.length > 0 && (
                    <optgroup label={r.vertical.name}>
                      {sameVertical.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Other categories">
                    {others.map((x) => <option key={x.slug} value={x.slug}>{x.name} — {x.vertical.name}</option>)}
                  </optgroup>
                </select>
                <span style={S.or}>or</span>
                <input
                  placeholder={`New role in ${r.vertical.name}`}
                  value={newName[r.id] ?? ""}
                  onChange={(e) => { setNewName((n) => ({ ...n, [r.id]: e.target.value })); setPick((p) => ({ ...p, [r.id]: "" })); }}
                  style={S.input}
                />
                <button type="button" disabled={busy !== null} onClick={() => release(r)} style={S.cta}>
                  {busy === r.id ? "Releasing…" : "Release live"}
                </button>
              </div>
            </div>
          );
        })}
    </HqShell>
  );
}

const S: Record<string, CSSProperties> = {
  mut: { color: "#64748B", fontSize: 13.5 },
  err: { background: "#FEF2F2", color: "#B42318", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px", marginBottom: 12 },
  top: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { fontSize: 14.5, fontWeight: 800, color: "#0F172A" },
  cat: { fontSize: 11, fontWeight: 700, color: "#5B21B6", background: "#EDE9FE", borderRadius: 999, padding: "2px 9px" },
  age: { fontSize: 11.5, color: "#64748B" },
  by: { fontSize: 12, color: "#64748B", marginTop: 5 },
  excerpt: { fontSize: 12.5, lineHeight: 1.6, color: "#334155", margin: "9px 0 0", maxHeight: 62, overflow: "hidden" },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 },
  select: { flex: "1 1 240px", minWidth: 200, border: "1px solid #E2E8F0", borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" },
  or: { fontSize: 12, color: "#94A3B8" },
  input: { flex: "1 1 200px", minWidth: 180, border: "1px solid #E2E8F0", borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" },
  cta: { border: "none", background: "#4F46E5", color: "#fff", fontWeight: 700, borderRadius: 9, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", flex: "none" },
};
