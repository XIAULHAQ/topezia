"use client";

/**
 * Post a job or a project. One form, two kinds — a project is contract work
 * with a budget and proposals; a job is a role with a salary and applicants.
 * On publish the posting walks the same extraction + embedding pipeline as
 * every crawled job, so it competes in the feed on the same honest terms.
 */
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { C, GRAD, FONT } from "@/app/_components/ui";

const EMPLOYMENT = [["FULL_TIME", "Full-time"], ["PART_TIME", "Part-time"], ["CONTRACT", "Contract"], ["HOURLY", "Hourly"], ["TEMP", "Temp"]] as const;
const REMOTE = [["ONSITE", "On-site"], ["HYBRID", "Hybrid"], ["REMOTE_INTL", "Remote (your region)"], ["REMOTE_GLOBAL", "Remote (worldwide)"]] as const;

export default function PostingForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"JOB" | "PROJECT">("JOB");
  const [f, setF] = useState({
    title: "", description: "", employmentType: "FULL_TIME", remoteType: "ONSITE",
    location: "", salaryMin: "", salaryMax: "", salaryCurrency: "USD", salaryPeriod: "YEAR",
  });
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function publish() {
    setState("sending"); setError(null);
    try {
      const res = await fetch("/api/postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: f.title,
          description: f.description,
          employmentType: f.employmentType,
          remoteType: f.remoteType,
          location: f.location,
          salaryMin: f.salaryMin ? Number(f.salaryMin) : null,
          salaryMax: f.salaryMax ? Number(f.salaryMax) : null,
          salaryCurrency: f.salaryCurrency,
          salaryPeriod: kind === "PROJECT" ? "PROJECT" : f.salaryPeriod,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.push("/employer");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't publish — try again.");
      setState("idle");
    }
  }

  return (
    <div style={{ maxWidth: 680, fontFamily: FONT }}>
      <Link href="/employer" style={{ fontSize: 13, color: C.mut, textDecoration: "none" }}>← Back to your postings</Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: "10px 0 18px" }}>Post {kind === "JOB" ? "a job" : "a project"}</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {(["JOB", "PROJECT"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} style={kind === k ? S.pillOn : S.pillOff}>
            {k === "JOB" ? "Job — hire someone" : "Project — get proposals"}
          </button>
        ))}
      </div>

      <div style={S.label}>Title *</div>
      <input style={S.input} value={f.title} onChange={(e) => set("title", e.target.value)}
        placeholder={kind === "JOB" ? "e.g. Senior Backend Engineer" : "e.g. Shopify store redesign"} />

      <div style={S.label}>Description *</div>
      <textarea style={{ ...S.input, resize: "vertical" }} rows={10} value={f.description} onChange={(e) => set("description", e.target.value)}
        placeholder={kind === "JOB"
          ? "The work, the team, the requirements, the process. Real detail attracts real applicants — our matcher also reads this to route the right people to it."
          : "Scope, deliverables, timeline, and what a good proposal covers. Our matcher reads this to route the right freelancers to it."} />
      <div style={S.hint}>Skills, seniority and category are extracted from your text automatically — same pipeline every job here goes through.</div>

      {kind === "JOB" && (
        <div style={S.two}>
          <div>
            <div style={S.label}>Employment type</div>
            <select style={S.input} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
              {EMPLOYMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div style={S.label}>Where</div>
            <select style={S.input} value={f.remoteType} onChange={(e) => set("remoteType", e.target.value)}>
              {REMOTE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      )}

      {(kind === "JOB" ? f.remoteType !== "REMOTE_GLOBAL" : true) && kind === "JOB" && (
        <>
          <div style={S.label}>Location</div>
          <input style={S.input} value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="City, Country — scopes who sees it" />
        </>
      )}

      <div style={S.two}>
        <div>
          <div style={S.label}>{kind === "JOB" ? "Salary range (optional)" : "Budget (optional)"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={S.input} inputMode="numeric" value={f.salaryMin} onChange={(e) => set("salaryMin", e.target.value.replace(/[^0-9]/g, ""))} placeholder="min" />
            <input style={S.input} inputMode="numeric" value={f.salaryMax} onChange={(e) => set("salaryMax", e.target.value.replace(/[^0-9]/g, ""))} placeholder="max" />
          </div>
        </div>
        <div>
          <div style={S.label}>Currency{kind === "JOB" ? " / period" : ""}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...S.input, width: 90 }} maxLength={3} value={f.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())} />
            {kind === "JOB" && (
              <select style={S.input} value={f.salaryPeriod} onChange={(e) => set("salaryPeriod", e.target.value)}>
                <option value="YEAR">per year</option><option value="HOUR">per hour</option><option value="DAY">per day</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {error && <div style={{ color: "#b42318", fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18 }}>
        <button type="button" onClick={publish} disabled={state === "sending"} style={S.cta}>
          {state === "sending" ? "Publishing…" : "Publish — it goes live now"}
        </button>
        <span style={{ fontSize: 12, color: C.mut }}>Free while we grow. You can close it any time.</span>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  label: { fontSize: 12, fontWeight: 700, color: C.slate, margin: "14px 0 5px" },
  input: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", background: "#fff" },
  hint: { fontSize: 11.5, color: C.mut, marginTop: 6, lineHeight: 1.5 },
  two: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  pillOn: { background: GRAD, color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { background: "#fff", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  cta: { background: GRAD, color: "#fff", border: "none", borderRadius: 10, padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
