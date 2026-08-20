"use client";

/**
 * "Your application" readiness rows — three real signals, independently
 * client-fetched (same decoupled pattern as MatchCard/TailorButton): is
 * there a signed-in profile, does a master resume exist (GET /api/resume's
 * `saved` flag), does a tailored version exist for THIS job (GET
 * /api/resume?jobId= 200 vs 404 — the same check TailorButton already runs
 * for its own button label). No new backend calls. Renders bare (no card
 * chrome) — the caller (job page.tsx) already owns the "Your application"
 * card that both this and TailorButton sit inside.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "@/app/_components/ui";
import { createClient } from "@/lib/supabase/client";

const MUTED = "#64748B";

type Row = { label: string; ok: boolean | null };

export default function ApplicationReadiness({ jobId }: { jobId: string }) {
  // null while we don't yet know. A signed-out visitor never sees this list at
  // all — see the early return below — so it must not flash on first paint.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([
    { label: "Topezia profile", ok: null },
    { label: "Master resume", ok: null },
    { label: "Tailored version", ok: null },
  ]);

  useEffect(() => {
    let cancelled = false;
    createClient().auth.getSession().then(({ data }) => {
      const signedIn = !!data.session;
      if (cancelled) return;
      setSignedIn(signedIn);
      setRows((r) => r.map((row) => (row.label === "Topezia profile" ? { ...row, ok: signedIn } : row)));
      if (!signedIn) {
        setRows((r) => r.map((row) => (row.label !== "Topezia profile" ? { ...row, ok: false } : row)));
        return;
      }
      fetch("/api/resume")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled) setRows((r) => r.map((row) => (row.label === "Master resume" ? { ...row, ok: !!d?.saved } : row))); })
        .catch(() => { if (!cancelled) setRows((r) => r.map((row) => (row.label === "Master resume" ? { ...row, ok: false } : row))); });
      fetch(`/api/resume?jobId=${encodeURIComponent(jobId)}`)
        .then((r) => { if (!cancelled) setRows((rr) => rr.map((row) => (row.label === "Tailored version" ? { ...row, ok: r.ok } : row))); })
        .catch(() => { if (!cancelled) setRows((r) => r.map((row) => (row.label === "Tailored version" ? { ...row, ok: false } : row))); });
    }).catch(() => { if (!cancelled) { setSignedIn(false); setRows((r) => r.map((row) => ({ ...row, ok: false }))); } });
    return () => { cancelled = true; };
  }, [jobId]);

  // A checklist of three things you cannot do yet is not help — it is three
  // more reasons to leave. Signed out, the rail says ONE thing: sign in to
  // apply. See ApplyBox, which owns that card.
  if (signedIn !== true) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 12 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ ...S.mark, background: r.ok === null ? "#F1F5F9" : r.ok ? "#ECFDF5" : "#F1F5F9", color: r.ok ? "#059669" : MUTED }}>
            {r.ok === null ? null : r.ok ? <Icon name="check" size={13} /> : <Icon name="plus" size={13} />}
          </span>
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#334155" }}>{r.label}</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: r.ok === null ? MUTED : r.ok ? "#059669" : MUTED }}>
            {r.ok === null ? "…" : r.label === "Tailored version" ? (r.ok ? "Draft" : "Not started") : r.ok ? "Ready" : "Missing"}
          </span>
        </div>
      ))}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  mark: { width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", flex: "none" },
};
