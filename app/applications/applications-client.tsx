"use client";

/**
 * The member's side of the pipeline: every application/proposal they've sent
 * to a native posting, with the SAME stage word the employer sees — no
 * "under review" euphemisms.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, FONT } from "@/app/_components/ui";

type Row = {
  id: string; stage: string; createdAt: string;
  job: { id: string; titleRaw: string; kind: string; companyName: string; status: string };
};

const STAGE: Record<string, { label: string; color: string; bg: string }> = {
  APPLIED: { label: "Applied", color: "#4F46E5", bg: "#EEF2FF" },
  SHORTLISTED: { label: "Shortlisted", color: "#047857", bg: "#ECFDF5" },
  INTERVIEW: { label: "Interview", color: "#B45309", bg: "#FFFBEB" },
  SELECTED: { label: "Selected ✓", color: "#047857", bg: "#ECFDF5" },
  REJECTED: { label: "Not this time", color: "#9A3412", bg: "#FFF7ED" },
  WITHDRAWN: { label: "Withdrawn", color: "#6b7280", bg: "#F3F4F6" },
};

export default function ApplicationsClient() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/applications").then((r) => (r.ok ? r.json() : { applications: [] })).then((d) => setRows(d.applications ?? [])).catch(() => setRows([]));
  }, []);

  async function withdraw(row: Row) {
    if (!window.confirm(`Withdraw from “${row.job.titleRaw}”? This can't be undone.`)) return;
    const res = await fetch(`/api/applications/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "WITHDRAWN" }) });
    if (res.ok) setRows((cur) => (cur ?? []).map((x) => (x.id === row.id ? { ...x, stage: "WITHDRAWN" } : x)));
  }

  return (
    <div style={{ maxWidth: 760, fontFamily: FONT }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: "0 0 4px" }}>My applications</h1>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
        Jobs and projects posted on Topezia that you&apos;ve applied to. You see the same stage the employer set — nothing softened.
      </p>

      {rows === null && <p style={{ color: C.mut, fontSize: 14 }}>Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <div style={S.empty}>
          Nothing yet. When a posting says <b>posted on Topezia</b>, you apply right here and track it on this page.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(rows ?? []).map((r) => {
          const st = STAGE[r.stage] ?? STAGE.APPLIED;
          const open = r.stage === "APPLIED" || r.stage === "SHORTLISTED" || r.stage === "INTERVIEW";
          return (
            <div key={r.id} style={S.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/job/${r.job.id}`} style={{ fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: "none" }}>{r.job.titleRaw}</Link>
                  <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 999, padding: "3px 10px" }}>{st.label}</span>
                  {r.job.status !== "LIVE" && <span style={{ fontSize: 11, color: C.mut }}>posting closed</span>}
                </div>
                <div style={{ fontSize: 12.5, color: C.mut, marginTop: 4 }}>
                  {r.job.companyName} · {r.job.kind === "PROJECT" ? "proposal" : "application"} sent {new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </div>
              </div>
              {open && (
                <button type="button" onClick={() => withdraw(r)} style={S.withdraw}>Withdraw</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  row: { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", flexWrap: "wrap" },
  empty: { border: `1px dashed ${C.line}`, borderRadius: 14, padding: "26px 22px", color: C.mut, fontSize: 13.5, lineHeight: 1.6, background: "#fff" },
  withdraw: { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "#b42318", cursor: "pointer", fontFamily: "inherit", flex: "none" },
};
