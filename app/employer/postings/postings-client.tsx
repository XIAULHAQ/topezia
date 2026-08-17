"use client";

/**
 * The postings list, with the states an employer actually needs to tell
 * apart: live, waiting on us for a category (migration 079), draft, closed.
 * Every row can be opened, edited or closed from here.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, Icon } from "@/app/_components/ui";

type Posting = {
  id: string; kind: string; titleRaw: string; status: string; createdAt: string;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string | null;
  companyName: string | null; total: number; byStage: Record<string, number>;
};

const TABS = ["Live", "Waiting", "Draft", "Closed", "All"] as const;
type Tab = (typeof TABS)[number];

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d < 1 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

const money = (p: Posting) => {
  if (!p.salaryMin && !p.salaryMax) return null;
  const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = p.salaryMin && p.salaryMax ? `${f(p.salaryMin)}–${f(p.salaryMax)}` : f((p.salaryMin ?? p.salaryMax)!);
  const per = p.salaryPeriod === "HOUR" ? "/hr" : p.salaryPeriod === "DAY" ? "/day" : p.salaryPeriod === "PROJECT" ? " total" : "/yr";
  return `${p.salaryCurrency} ${range}${per}`;
};

export default function PostingsClient() {
  const [postings, setPostings] = useState<Posting[] | null>(null);
  const [tab, setTab] = useState<Tab>("All");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/postings", { cache: "no-store" });
    if (!r.ok) { setPostings([]); return; }
    const d = await r.json();
    setPostings(d.postings ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(p: Posting, status: "LIVE" | "EXPIRED") {
    setBusy(p.id); setError(null);
    try {
      const res = await fetch(`/api/postings/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "");
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That didn't work — try again.");
    } finally { setBusy(null); }
  }

  const is = (p: Posting, t: Tab) =>
    t === "All" ? true
      : t === "Live" ? p.status === "LIVE"
      : t === "Waiting" ? p.status === "PENDING_ROLE"
      : t === "Draft" ? p.status === "DRAFT"
      : p.status !== "LIVE" && p.status !== "DRAFT" && p.status !== "PENDING_ROLE";

  const shown = (postings ?? []).filter((p) => is(p, tab));

  return (
    <div>
      <div style={S.head}>
        <div>
          <h1 style={S.h1}>Your postings</h1>
          <p style={S.sub}>Every job and project you&apos;ve posted — from this company and under your own name.</p>
        </div>
        <Link href="/employer/new" style={S.cta}><Icon name="plus" size={15} />Post a job or project</Link>
      </div>

      <div style={S.tabs}>
        {TABS.map((t) => {
          const n = (postings ?? []).filter((p) => is(p, t)).length;
          if (t === "Waiting" && n === 0) return null; // a state most accounts never see
          return (
            <button key={t} type="button" onClick={() => setTab(t)} style={t === tab ? S.tabOn : S.tabOff}>
              {t}{n > 0 && <span style={{ opacity: 0.65 }}> · {n}</span>}
            </button>
          );
        })}
      </div>

      {error && <div style={S.err}>{error}</div>}

      {postings === null ? <p style={S.mut}>Loading…</p>
        : shown.length === 0 ? (
          <div style={S.empty}>
            {tab === "All"
              ? "Nothing posted yet. Your first posting goes live immediately — same feed, same honest matching as every other job here."
              : `Nothing ${tab.toLowerCase()}.`}
          </div>
        ) : shown.map((p) => (
          <div key={p.id} style={S.card}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={S.rowTop}>
                <Link href={`/employer/${p.id}`} style={S.title}>{p.titleRaw}</Link>
                <span style={p.kind === "PROJECT" ? S.projTag : S.jobTag}>{p.kind === "PROJECT" ? "Project" : "Job"}</span>
                <span style={p.status === "LIVE" ? S.liveTag : p.status === "DRAFT" ? S.draftTag : p.status === "PENDING_ROLE" ? S.heldTag : S.closedTag}>
                  {p.status === "LIVE" ? "Live" : p.status === "DRAFT" ? "Draft" : p.status === "PENDING_ROLE" ? "Waiting on us" : "Closed"}
                </span>
              </div>
              <div style={S.meta}>
                <span>{p.status === "DRAFT" ? "Saved" : "Posted"} {ago(p.createdAt)}</span>
                {p.companyName && <span>· {p.companyName}</span>}
                {money(p) && <span>· {money(p)}</span>}
                <span>· {p.total} applicant{p.total === 1 ? "" : "s"}</span>
              </div>
              {p.status === "PENDING_ROLE" && (
                <div style={S.heldNote}>
                  Held until we add a role for the category you picked — nothing for you to do. It goes live on its own.
                </div>
              )}
            </div>
            <div style={S.actions}>
              <Link href={`/employer/${p.id}/edit`} style={S.ghost}><Icon name="edit" size={14} />Edit</Link>
              <Link href={`/employer/${p.id}`} style={S.ghost}>Pipeline</Link>
              {p.status === "DRAFT" ? (
                <button type="button" disabled={busy === p.id} onClick={() => setStatus(p, "LIVE")} style={S.ghost}>
                  {busy === p.id ? "Publishing…" : "Publish"}
                </button>
              ) : p.status === "PENDING_ROLE" ? (
                <button type="button" disabled={busy === p.id} onClick={() => setStatus(p, "EXPIRED")} style={S.ghost}>Withdraw</button>
              ) : (
                <button type="button" disabled={busy === p.id} onClick={() => setStatus(p, p.status === "LIVE" ? "EXPIRED" : "LIVE")} style={S.ghost}>
                  {p.status === "LIVE" ? "Close" : "Reopen"}
                </button>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  head: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 },
  h1: { fontSize: 23, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 },
  sub: { fontSize: 13.5, color: C.mut, margin: "6px 0 0", maxWidth: 560, lineHeight: 1.6 },
  cta: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, background: GRAD, color: "#fff", borderRadius: 11, padding: "10px 17px", fontSize: 13.5, fontWeight: 700, textDecoration: "none", flex: "none" },
  tabs: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 },
  tabOn: { background: "#EEF2FF", color: "#4F46E5", border: "1px solid #C7D2FE", borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tabOff: { background: "#fff", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  card: { display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 },
  rowTop: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" },
  title: { fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: "none" },
  meta: { display: "flex", gap: 7, flexWrap: "wrap", fontSize: 11.5, color: C.mut, marginTop: 7 },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" },
  ghost: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, color: C.slate, textDecoration: "none", cursor: "pointer", fontFamily: "inherit" },
  jobTag: { fontSize: 11, fontWeight: 700, color: "#4F46E5", background: "#EEF2FF", borderRadius: 999, padding: "3px 9px" },
  projTag: { fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FEF3C7", borderRadius: 999, padding: "3px 9px" },
  liveTag: { fontSize: 11, fontWeight: 700, color: "#047857", background: "#ECFDF5", borderRadius: 999, padding: "3px 9px" },
  draftTag: { fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FEF3C7", borderRadius: 999, padding: "3px 9px" },
  closedTag: { fontSize: 11, fontWeight: 700, color: "#64748B", background: "#F1F5F9", borderRadius: 999, padding: "3px 9px" },
  heldTag: { fontSize: 11, fontWeight: 700, color: "#5B21B6", background: "#EDE9FE", borderRadius: 999, padding: "3px 9px" },
  heldNote: { fontSize: 12, lineHeight: 1.55, color: "#5B21B6", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: "8px 11px", marginTop: 9, maxWidth: 560 },
  empty: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px", fontSize: 13.5, color: C.mut, lineHeight: 1.6 },
  mut: { fontSize: 13.5, color: C.mut },
  err: { background: "#FEF2F2", color: "#B42318", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
};
