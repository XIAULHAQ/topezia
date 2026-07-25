"use client";

/**
 * The pipeline for one posting: applied → shortlisted → interview → selected.
 * Interviews themselves happen wherever the employer runs them (their email,
 * their calls) — the stage records WHERE someone is, honestly, and the
 * applicant sees the same stage word on their side.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, FONT, initials } from "@/app/_components/ui";

type App = {
  id: string; stage: string; coverNote: string | null; proposedRate: number | null; proposedCurrency: string | null; createdAt: string;
  profile: { fullName: string | null; publicSlug: string | null; currentLocation: string | null; yearsExperience: number | null; photoUrl: string | null };
};

const STAGES = ["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED"] as const;
const STAGE_LABEL: Record<string, string> = {
  APPLIED: "Applied", SHORTLISTED: "Shortlisted", INTERVIEW: "Interview", SELECTED: "Selected", REJECTED: "Rejected", WITHDRAWN: "Withdrawn",
};
/** The one-step-forward action each stage offers. */
const NEXT: Record<string, { to: string; label: string }> = {
  APPLIED: { to: "SHORTLISTED", label: "Shortlist" },
  SHORTLISTED: { to: "INTERVIEW", label: "Move to interview" },
  INTERVIEW: { to: "SELECTED", label: "Select ✓" },
};

export default function PipelineClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<{ title: string; kind: string; status: string } | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications?jobId=${encodeURIComponent(jobId)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); })
      .then((d) => { setJob(d.job); setApps(d.applications); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
  }, [jobId]);

  async function move(app: App, stage: string) {
    const res = await fetch(`/api/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
    if (res.ok) setApps((cur) => (cur ?? []).map((a) => (a.id === app.id ? { ...a, stage } : a)));
  }

  if (error) return <p style={{ color: "#b42318", fontFamily: FONT }}>{error}</p>;
  if (!job || !apps) return <p style={{ color: C.mut, fontFamily: FONT }}>Loading…</p>;

  const isProject = job.kind === "PROJECT";
  const active = apps.filter((a) => a.stage !== "REJECTED" && a.stage !== "WITHDRAWN");
  const closed = apps.filter((a) => a.stage === "REJECTED" || a.stage === "WITHDRAWN");

  const card = (a: App) => (
    <div key={a.id} style={S.card}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {a.profile.photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.profile.photoUrl} alt="" style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
          : <div style={{ width: 42, height: 42, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flex: "none" }}>{initials(a.profile.fullName)}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {a.profile.publicSlug
              ? <a href={`/p/${a.profile.publicSlug}`} target="_blank" rel="noreferrer" style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, textDecoration: "none" }}>{a.profile.fullName ?? "Applicant"} ↗</a>
              : <span style={{ fontSize: 14.5, fontWeight: 700 }}>{a.profile.fullName ?? "Applicant"}</span>}
            <span style={S.stageTag}>{STAGE_LABEL[a.stage]}</span>
            {a.proposedRate != null && <span style={{ fontSize: 12.5, fontWeight: 700, color: "#047857" }}>bid {a.proposedCurrency ?? "USD"} {a.proposedRate.toLocaleString()}</span>}
          </div>
          <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>
            {[a.profile.currentLocation, a.profile.yearsExperience != null ? `${a.profile.yearsExperience}+ yrs` : null].filter(Boolean).join(" · ")}
            {" · "}{isProject ? "proposed" : "applied"} {new Date(a.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </div>
          {a.coverNote && <p style={{ fontSize: 13, color: C.slate, lineHeight: 1.6, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{a.coverNote}</p>}
        </div>
      </div>
      {a.stage !== "REJECTED" && a.stage !== "WITHDRAWN" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {NEXT[a.stage] && (
            <button type="button" onClick={() => move(a, NEXT[a.stage].to)} style={S.fwd}>{NEXT[a.stage].label}</button>
          )}
          {a.stage !== "SELECTED" && (
            <button type="button" onClick={() => move(a, "REJECTED")} style={S.rej}>Pass</button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 860, fontFamily: FONT }}>
      <Link href="/employer" style={{ fontSize: 13, color: C.mut, textDecoration: "none" }}>← All postings</Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: "10px 0 4px" }}>{job.title}</h1>
      <p style={{ color: C.mut, fontSize: 13.5, margin: "0 0 20px" }}>
        {active.length} in play · {isProject ? "proposals" : "applicants"} move Applied → Shortlisted → Interview → Selected.
        Interviews run wherever you run them — the stage here just keeps both sides honest about where things stand.
      </p>

      {STAGES.map((s) => {
        const inStage = active.filter((a) => a.stage === s);
        if (inStage.length === 0 && s !== "APPLIED") return null;
        return (
          <section key={s} style={{ marginBottom: 22 }}>
            <h2 style={S.stageHead}>{STAGE_LABEL[s]} <span style={{ color: C.mut, fontWeight: 600 }}>· {inStage.length}</span></h2>
            {inStage.length === 0
              ? <p style={{ color: C.mut, fontSize: 13 }}>{apps.length === 0 ? "No one yet — postings reach people through matching, so give it time." : "Empty."}</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{inStage.map(card)}</div>}
          </section>
        );
      })}

      {closed.length > 0 && (
        <section>
          <h2 style={{ ...S.stageHead, color: C.mut }}>No longer in play · {closed.length}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.65 }}>{closed.map(card)}</div>
        </section>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px" },
  stageHead: { fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", margin: "0 0 10px" },
  stageTag: { fontSize: 10.5, fontWeight: 700, color: "#4F46E5", background: "#EEF2FF", borderRadius: 999, padding: "3px 9px" },
  fwd: { background: GRAD, color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  rej: { background: "#fff", color: "#b42318", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
