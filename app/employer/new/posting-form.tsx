"use client";

/**
 * Post a job or a project — with the pieces a real posting needs:
 * a category from our taxonomy (routes matching), explicit required skills,
 * an AI writer that drafts from the employer's own notes, and a live
 * requirements checklist mirroring exactly what the API enforces.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { C, GRAD, FONT } from "@/app/_components/ui";

const EMPLOYMENT = [["FULL_TIME", "Full-time"], ["PART_TIME", "Part-time"], ["CONTRACT", "Contract"], ["HOURLY", "Hourly"], ["TEMP", "Temp"]] as const;
const REMOTE = [["ONSITE", "On-site"], ["HYBRID", "Hybrid"], ["REMOTE_INTL", "Remote (your region)"], ["REMOTE_GLOBAL", "Remote (worldwide)"]] as const;

export default function PostingForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"JOB" | "PROJECT">("JOB");
  const [roleGroups, setRoleGroups] = useState<{ field: string; roles: string[] }[]>([]);
  const [f, setF] = useState({
    title: "", role: "", description: "", employmentType: "FULL_TIME", remoteType: "ONSITE",
    location: "", salaryMin: "", salaryMax: "", salaryCurrency: "USD", salaryPeriod: "YEAR",
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [notes, setNotes] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Who this is posted AS. An account may own several companies (migration
  // 076) or none; a posting always carries exactly one poster identity —
  // one of those companies, or the person under their own profile name.
  // Defaults to the active company, or "self" when there is none. Sent to
  // /api/postings and /api/postings/assist as `postAs`.
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [postAs, setPostAs] = useState<string>("");

  useEffect(() => {
    fetch("/api/taxonomy/roles").then((r) => (r.ok ? r.json() : null)).then((d) => d && setRoleGroups(d.roleGroups ?? [])).catch(() => {});
    fetch("/api/company", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      const list: { id: string; name: string }[] = Array.isArray(d.companies) ? d.companies : [];
      setCompanies(list);
      setPostAs(d.company?.id ?? "self");
    }).catch(() => {});
  }, []);

  /**
   * Read a response without ever throwing a parse error at the user.
   *
   * A serverless function that crashes or times out answers with no body (or
   * an HTML error page), so `await res.json()` threw "Unexpected end of JSON
   * input" — which is what a real employer saw instead of a usable message
   * when the enrichment step failed mid-publish.
   */
  async function readJson(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text().catch(() => "");
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  const addSkill = () => {
    const s = newSkill.trim();
    if (s && !skills.some((x) => x.toLowerCase() === s.toLowerCase())) setSkills((xs) => [...xs, s].slice(0, 20));
    setNewSkill("");
  };

  // Mirrors the API's enforcement exactly — no surprise rejections.
  const reqs: { label: string; met: boolean }[] = [
    { label: "A real title (8+ characters)", met: f.title.trim().length >= 8 },
    { label: "A category — it routes the right people to you", met: !!f.role },
    { label: "Description of 200+ characters", met: f.description.trim().length >= 200 },
    { label: "At least 2 required skills", met: skills.length >= 2 },
  ];
  const ready = reqs.every((r) => r.met);

  async function writeWithAi() {
    setDrafting(true); setError(null);
    try {
      const res = await fetch("/api/postings/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title: f.title, role: f.role, notes, skills, postAs: postAs || undefined }),
      });
      const d = await readJson(res);
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "");
      set("description", String(d.draft ?? ""));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't draft that — try again.");
    } finally {
      setDrafting(false);
    }
  }

  /** `draft` saves without the publish bar and without spending an LLM call —
   *  see lib/employer/publish.ts for why enrichment waits until publish. */
  async function submit(draft: boolean) {
    setState("sending"); setError(null);
    try {
      const res = await fetch("/api/postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          postAs: postAs || undefined,
          kind, title: f.title, role: f.role, description: f.description, skills,
          employmentType: f.employmentType, remoteType: f.remoteType, location: f.location,
          salaryMin: f.salaryMin ? Number(f.salaryMin) : null,
          salaryMax: f.salaryMax ? Number(f.salaryMax) : null,
          salaryCurrency: f.salaryCurrency,
          salaryPeriod: kind === "PROJECT" ? "PROJECT" : f.salaryPeriod,
        }),
      });
      const d = await readJson(res);
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "");
      router.push("/employer");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : draft
            ? "Couldn't save that draft — try again."
            : "Couldn't publish that — nothing was lost, your posting is still here. Try again, and if it keeps failing the team has been notified."
      );
      setState("idle");
    }
  }

  const publish = () => submit(false);
  const saveDraft = () => submit(true);

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

      {companies.length > 0 && (
        <div>
          <div style={S.label}>Post as *</div>
          <select style={S.input} value={postAs} onChange={(e) => setPostAs(e.target.value)} aria-label="Post as">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="self">Yourself — under your own name, no company page</option>
          </select>
        </div>
      )}

      <div style={S.two}>
        <div>
          <div style={S.label}>Title *</div>
          <input style={S.input} value={f.title} onChange={(e) => set("title", e.target.value)}
            placeholder={kind === "JOB" ? "e.g. Senior Backend Engineer" : "e.g. Shopify store redesign"} />
        </div>
        <div>
          <div style={S.label}>Category *</div>
          <select style={S.input} value={f.role} onChange={(e) => set("role", e.target.value)}>
            <option value="">Choose the closest role…</option>
            {roleGroups.map((g) => (
              <optgroup key={g.field} label={g.field}>
                {g.roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div style={S.label}>Required skills * <span style={{ fontWeight: 500, color: C.mut }}>— at least 2; type and press Enter</span></div>
      {skills.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {skills.map((s) => (
            <span key={s} style={S.chip}>{s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => setSkills((xs) => xs.filter((x) => x !== s))} style={S.chipX}>×</button>
            </span>
          ))}
        </div>
      )}
      <input style={S.input} value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
        onBlur={addSkill}
        placeholder="e.g. React, Figma, Google Ads…" />
      <div style={S.hint}>We also extract more from your description automatically — these are the must-haves applicants are scored against.</div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={S.label}>Description *</div>
        <button type="button" onClick={() => setAiOpen((o) => !o)} style={S.aiToggle}>✦ Write it with AI</button>
      </div>
      {aiOpen && (
        <div style={S.aiBox}>
          <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.55, marginBottom: 8 }}>
            Give it your rough notes — the work, the must-haves, anything on pay or process. It drafts only from what you write (nothing invented), and you edit before publishing.
          </div>
          <textarea style={{ ...S.input, resize: "vertical" }} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={kind === "JOB" ? "e.g. Need someone to own our Django backend, 4+ yrs, Postgres + Redis, remote ok within EU, interviews: intro call + tech screen" : "e.g. Redesign our 12-page Shopify store, new theme, mobile-first, need it in 6 weeks, budget around $3k"} />
          <button type="button" onClick={writeWithAi} disabled={drafting || !f.title || notes.trim().length < 20} style={{ ...S.cta, padding: "9px 16px", fontSize: 12.5, marginTop: 8, opacity: drafting || !f.title || notes.trim().length < 20 ? 0.6 : 1 }}>
            {drafting ? "Drafting…" : f.description ? "Redraft from notes" : "Draft the description"}
          </button>
        </div>
      )}
      <textarea style={{ ...S.input, resize: "vertical" }} rows={10} value={f.description} onChange={(e) => set("description", e.target.value)}
        placeholder="The work, the team, the requirements, the process. Real detail attracts real applicants — our matcher also reads this to route the right people to it." />

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

      {kind === "JOB" && f.remoteType !== "REMOTE_GLOBAL" && (
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

      {/* Posting requirements — the same checks the API enforces, live. */}
      <div style={S.reqBox}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Posting requirements</div>
        {reqs.map((r) => (
          <div key={r.label} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: r.met ? "#047857" : C.mut, marginBottom: 5 }}>
            <span style={{ width: 16, textAlign: "center", fontWeight: 800 }}>{r.met ? "✓" : "○"}</span>{r.label}
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: C.mut, marginTop: 6, lineHeight: 1.5 }}>
          Also: post real openings under your real company, and no requirements that discriminate by age, gender, religion or ethnicity. Postings that break this get removed.
        </div>
      </div>

      {error && <div style={{ color: "#b42318", fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={publish} disabled={state === "sending" || !ready} style={{ ...S.cta, opacity: state === "sending" || !ready ? 0.55 : 1 }}>
          {state === "sending" ? "Publishing…" : ready ? "Publish — it goes live now" : "Meet the requirements above to publish"}
        </button>
        {/* A draft only needs a title: the whole point is somewhere to put
            unfinished work. The publish bar is re-checked when it goes live. */}
        <button
          type="button"
          onClick={saveDraft}
          disabled={state === "sending" || !f.title.trim()}
          style={{ ...S.ghost, opacity: state === "sending" || !f.title.trim() ? 0.55 : 1 }}
        >
          Save as draft
        </button>
        <span style={{ fontSize: 12, color: C.mut }}>
          {ready ? "Free while we grow. You can close it any time." : "A draft stays private until you publish it."}
        </span>
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
  ghost: { background: "#fff", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "5px 11px", fontSize: 12.5, fontWeight: 700 },
  chipX: { border: "none", background: "none", color: "#4F46E5", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, fontFamily: "inherit" },
  aiToggle: { border: "none", background: "none", color: "#7C3AED", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 },
  aiBox: { border: "1px solid #DDD6FE", background: "#F5F3FF", borderRadius: 12, padding: "12px 14px", marginBottom: 10 },
  reqBox: { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 12, padding: "14px 16px", marginTop: 18 },
};
