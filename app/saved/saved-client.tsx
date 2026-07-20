"use client";

/**
 * Saved list — fetches /api/saves and renders removable cards.
 *
 * One component for both saved pages. Projects ARE jobs with kind = PROJECT,
 * so the only real differences are the copy and the fact that a project's money
 * is a budget in the poster's own currency rather than a salary.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { C, GRAD, Icon, Card } from "@/app/_components/ui";
import { curSym } from "@/lib/currency";

type SavedJob = {
  jobId: string; kind: string; title: string; company: string; locationState: string | null;
  country: string | null; remoteScope: string | null; remoteType: string; employmentType: string;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null; salaryCurrency: string;
  source: string; verticalSlug: string; lastVerifiedAt: string;
};

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");
const REGION_LABEL: Record<string, string> = { GLOBAL: "Anywhere", EMEA: "EMEA", APAC: "APAC", LATAM: "LatAm", ANZ: "ANZ", EUROPE: "Europe", NORTH_AMERICA: "North America" };
function placeLabel(j: SavedJob): string {
  if (j.remoteType === "ONSITE" || j.remoteType === "HYBRID") return j.locationState || REGION_LABEL[j.remoteScope ?? ""] || j.country || label(j.remoteType);
  if (!j.remoteScope) return "Remote";
  return j.remoteScope === "US" ? "Remote (US)" : `Remote (${REGION_LABEL[j.remoteScope] ?? j.remoteScope})`;
}
function fmtSalary(j: SavedJob): string | null {
  if (j.salaryMin == null && j.salaryMax == null) return null;
  // Never convert — show what the poster listed, in their currency.
  const sym = curSym(j.salaryCurrency);
  const per = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "PER_MILE" ? "/mi" : j.salaryPeriod === "DAY" ? "/day" : j.salaryPeriod === "PROJECT" ? " budget" : "/yr";
  const k = (n: number) => (j.salaryPeriod === "YEAR" && n >= 1000 ? `${Math.round(n / 1000)}k` : `${n.toLocaleString()}`);
  if (j.salaryMin != null && j.salaryMax != null) return `${sym}${k(j.salaryMin)}–${sym}${k(j.salaryMax)}${per}`;
  return `${sym}${k((j.salaryMin ?? j.salaryMax)!)}${per}`;
}

export default function SavedClient({ kind = "JOB" }: { kind?: "JOB" | "PROJECT" }) {
  const [jobs, setJobs] = useState<SavedJob[] | null>(null);
  const isProject = kind === "PROJECT";

  useEffect(() => {
    fetch(`/api/saves?kind=${kind}`).then((r) => (r.ok ? r.json() : { jobs: [] })).then((d) => setJobs(d.jobs ?? [])).catch(() => setJobs([]));
  }, [kind]);

  async function unsave(jobId: string) {
    setJobs((prev) => (prev ? prev.filter((j) => j.jobId !== jobId) : prev));
    try { await fetch(`/api/saves?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" }); } catch { /* best effort */ }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.4px" }}>{isProject ? "Saved projects" : "Saved jobs"}</h1>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 22px" }}>
        {isProject
          ? "Freelance projects you bookmarked. They stay here until you remove them."
          : "Jobs you bookmarked from your feed. They stay here until you remove them."}
      </p>

      {jobs === null && <p style={{ color: C.mut }}>Loading…</p>}
      {jobs !== null && jobs.length === 0 && (
        <div style={{ background: "#fff", border: `1px dashed ${C.line}`, borderRadius: 16, padding: 40, textAlign: "center", color: C.mut }}>
          Nothing saved yet. Tap the <Icon name="bookmark" size={14} /> on any {isProject ? "project" : "job"} in{" "}
          <a href={isProject ? "/projects" : "/feed"} style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>{isProject ? "freelance projects" : "your feed"}</a> to save it here.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {(jobs ?? []).map((j) => {
          const sal = fmtSalary(j);
          return (
            <Card key={j.jobId} style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 800, flex: "none" }}>{(j.company || "?")[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{j.title}</div>
                  <div style={{ fontSize: 12.5, color: C.slate, fontWeight: 600, marginTop: 3 }}>{j.company}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: C.mut }}>
                    <span style={S.meta}><Icon name="pin" size={13} />{placeLabel(j)}</span>
                    {!isProject && <span style={S.meta}><Icon name="clock" size={13} />{label(j.employmentType)}</span>}
                    {sal && <span style={{ ...S.meta, color: "#059669", fontWeight: 600 }}><Icon name="coins" size={13} />{sal}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div onClick={() => unsave(j.jobId)} title="Remove from saved" style={S.remove}><Icon name="bookmark" size={15} /></div>
                  <a href={`/job/${j.jobId}`} style={S.view}>{isProject ? "View project" : "View job"}</a>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  meta: { display: "inline-flex", alignItems: "center", gap: 5 },
  remove: { width: 36, height: 36, border: `1px solid #C7D2FE`, background: "#EEF2FF", color: C.c1, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer" },
  view: { background: GRAD, color: "#fff", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none" },
};
