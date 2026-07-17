"use client";

/**
 * Screen A — parse confirmation (spec §6.1).
 * "The last profile work you'll ever do here." Paste résumé → confirm the
 * parse (role, skills) → answer the three things a résumé can't tell us →
 * Show my matches.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Skill = { name: string; confidence: number };
type Parsed = {
  fullName: string | null;
  headlineRole: string | null;
  seniority: string;
  yearsExperience: number | null;
  skills: Skill[];
  workHistory: unknown[];
  education: unknown[];
  certifications: string[];
};

const SENIORITIES = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"];
/** Shown while the parse runs — the wait is real (an LLM call), so give people
 *  something true and useful to read instead of a frozen screen. */
const PARSE_TIPS = [
  "Most résumés get ~7 seconds from a human recruiter. We read all of it.",
  "We score honestly — including the low scores. A 45 tells you more than a fake 90.",
  "Skills you list once and skills you've led on look identical on paper. We tell them apart.",
  "You'll see the gaps too — what a job wants that you don't have yet.",
  "We never send your résumé to employers. It stays yours.",
];

const PARSE_STEPS = ["Reading the text", "Pulling out skills and history", "Working out seniority and fit", "Almost there"];

const WORK_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "HOURLY", "TEMP"];
// The RemoteType values describe a JOB's scope, not a person's preference —
// asking someone to tick "Remote US" vs "Remote Global" is asking them to think
// in our schema. One "Remote" chip covers every remote scope; whether they're
// actually eligible for a given one is decided by country, not by this answer.
const REMOTE_CHOICES: { label: string; values: string[] }[] = [
  { label: "In office", values: ["ONSITE"] },
  { label: "Hybrid", values: ["HYBRID"] },
  { label: "Remote", values: ["REMOTE_US", "REMOTE_GLOBAL", "REMOTE_INTL"] },
];
const label = (s: string) =>
  s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

export default function OnboardClient() {
  const router = useRouter();
  const [step, setStep] = useState<"paste" | "confirm">("paste");
  const [resumeText, setResumeText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [emp, setEmp] = useState<string[]>(["FULL_TIME"]);
  const [remote, setRemote] = useState<string[]>([]);
  const [salaryFloor, setSalaryFloor] = useState("");
  const [salaryTarget, setSalaryTarget] = useState("");
  const [salaryPeriod, setSalaryPeriod] = useState("YEAR");
  const [locations, setLocations] = useState("");
  const [tip, setTip] = useState(0);
  const [phase, setPhase] = useState(0);
  const [workAuth, setWorkAuth] = useState("NOT_SPECIFIED");

  const parsing = loading && step === "paste";
  useEffect(() => {
    if (!parsing) { setTip(0); setPhase(0); return; }
    const t = setInterval(() => setTip((i) => (i + 1) % PARSE_TIPS.length), 3800);
    // Advance through the steps but stop at the last one — never claim "done"
    // while we're still waiting on the API.
    const s = setInterval(() => setPhase((i) => Math.min(i + 1, PARSE_STEPS.length - 1)), 2600);
    return () => { clearInterval(t); clearInterval(s); };
  }, [parsing]);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function doParse() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      if (data.resumeText) setResumeText(data.resumeText);
      setParsed(data.parsed);
      setSkills(data.parsed.skills || []);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function doParseFile(file: File) {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that file");
      if (data.resumeText) setResumeText(data.resumeText);
      setParsed(data.parsed);
      setSkills(data.parsed.skills || []);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setFileName(null);
    } finally {
      setLoading(false);
    }
  }

  async function doSubmit() {
    if (!parsed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed: { ...parsed, skills },
          resumeText,
          preferences: {
            employmentTypes: emp,
            remoteTypes: remote,
            locations: locations
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean),
            salaryFloor: salaryFloor ? parseInt(salaryFloor, 10) : null,
            salaryTarget: salaryTarget ? parseInt(salaryTarget, 10) : null,
            salaryPeriod: salaryFloor || salaryTarget ? salaryPeriod : null,
            workAuthorization: workAuth,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push("/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main style={S.page}>
      <style>{"@keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}@keyframes fade{from{opacity:0}to{opacity:1}}"}</style>
      <div style={S.wrap}>
        <div style={S.brand}>topezia</div>

        {step === "paste" && (
          <>
            <h1 style={S.h1}>Upload your résumé once.</h1>
            <p style={S.sub}>
              Drop in your résumé — we&apos;ll read it, then show you only the jobs actually worth
              your time, and tell you why.
            </p>

            {parsing ? (
              <div style={S.parsing}>
                <div style={S.parseRow}>
                  <span style={S.check}>✓</span>
                  <span style={S.parseFile}>{fileName ?? "Your résumé"}</span>
                  <span style={S.parseGot}>{fileName ? "uploaded" : "received"}</span>
                </div>
                <div style={S.bar}><div style={S.barFill} /></div>
                <div style={S.parseStep}>{PARSE_STEPS[phase]}…</div>
                <div style={S.tip} key={tip}>{PARSE_TIPS[tip]}</div>
              </div>
            ) : (
            <label
              style={dragging ? S.dropzoneActive : S.dropzone}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f && !loading) doParseFile(f);
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                style={{ display: "none" }}
                disabled={loading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doParseFile(f); }}
              />
              <div style={S.dropIcon}>📄</div>
              <div style={S.dropTitle}>
                {loading && fileName ? `Reading ${fileName}…` : "Drop your résumé here, or click to browse"}
              </div>
              <div style={S.dropSub}>PDF, DOCX or plain text — up to 4MB. We read it and don&apos;t keep the file.</div>
            </label>
            )}

            {/* LinkedIn has no profile API for apps like us — Sign in with
                LinkedIn returns only name/email/photo. Exporting the profile to
                PDF is the honest equivalent, so point people at it. */}
            <p style={S.hint}>
              Only have LinkedIn? Open your profile → <strong>More</strong> → <strong>Save to PDF</strong>, and drop that in.
            </p>

            <details style={S.details}>
              <summary style={S.summary}>…or paste the text instead</summary>
              <textarea
                style={S.textarea}
                placeholder="Paste your full résumé text here…"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
              <button style={btn(loading || resumeText.trim().length < 40)} onClick={doParse} disabled={loading || resumeText.trim().length < 40}>
                {loading ? "Reading your résumé…" : "Parse pasted text"}
              </button>
            </details>

            {error && <p style={S.error}>{error}</p>}
          </>
        )}

        {step === "confirm" && parsed && (
          <>
            <h1 style={S.h1}>Here&apos;s what we read.</h1>
            <p style={S.sub}>The last profile work you&apos;ll ever do here. Fix anything that&apos;s off.</p>

            {/* 1. Role + seniority line */}
            <div style={S.card}>
              <div style={S.cardLabel}>You look like a</div>
              <div style={S.roleRow}>
                <input style={S.roleInput} value={parsed.headlineRole ?? ""} onChange={(e) => setParsed({ ...parsed, headlineRole: e.target.value })} />
                <select style={S.select} value={parsed.seniority} onChange={(e) => setParsed({ ...parsed, seniority: e.target.value })}>
                  {SENIORITIES.map((s) => (
                    <option key={s} value={s}>{label(s)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. Skills */}
            <div style={S.card}>
              <div style={S.cardLabel}>Your skills — tap dashed ones to confirm, × to remove</div>
              <div style={S.chips}>
                {skills.map((sk, i) => {
                  const solid = sk.confidence >= 0.8;
                  return (
                    <span key={sk.name + i} style={solid ? S.chipSolid : S.chipDashed}>
                      {!solid && (
                        <button style={S.chipConfirm} title="Confirm" onClick={() => setSkills(skills.map((x, j) => (j === i ? { ...x, confidence: 1 } : x)))}>
                          confirm?
                        </button>
                      )}
                      {sk.name}
                      <button style={S.chipX} onClick={() => setSkills(skills.filter((_, j) => j !== i))}>×</button>
                    </span>
                  );
                })}
              </div>
              <div style={S.addRow}>
                <input style={S.addInput} placeholder="Add a skill…" value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSkill.trim()) {
                      setSkills([...skills, { name: newSkill.trim(), confidence: 1 }]);
                      setNewSkill("");
                    }
                  }} />
              </div>
            </div>

            {/* 3. Three things a résumé can't tell us */}
            <div style={S.card}>
              <div style={S.cardLabel}>A few things your résumé can&apos;t tell us</div>
              <div style={S.qLabel}>Work type</div>
              <div style={S.chips}>
                {WORK_TYPES.map((w) => (
                  <button key={w} style={emp.includes(w) ? S.pillOn : S.pillOff} onClick={() => toggle(emp, w, setEmp)}>{label(w)}</button>
                ))}
              </div>
              <div style={S.qLabel}>Location / remote</div>
              <div style={S.chips}>
                {REMOTE_CHOICES.map((c) => {
                  const on = c.values.every((v) => remote.includes(v));
                  return (
                    <button
                      key={c.label}
                      style={on ? S.pillOn : S.pillOff}
                      onClick={() =>
                        setRemote(on ? remote.filter((v) => !c.values.includes(v)) : [...new Set([...remote, ...c.values])])
                      }
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div style={S.qLabel}>Where would you consider working? (optional)</div>
              <input
                style={S.wideInput}
                placeholder="e.g. Austin, Denver, anywhere in California"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
              />
              <p style={S.fieldHint}>Separate with commas. Leave blank if you&apos;re open anywhere.</p>

              <div style={S.qLabel}>Salary range (optional)</div>
              <div style={S.roleRow}>
                <input style={S.roleInput} type="number" placeholder="Won't go below" value={salaryFloor} onChange={(e) => setSalaryFloor(e.target.value)} />
                <input style={S.roleInput} type="number" placeholder="Aiming for" value={salaryTarget} onChange={(e) => setSalaryTarget(e.target.value)} />
                <select style={S.select} value={salaryPeriod} onChange={(e) => setSalaryPeriod(e.target.value)}>
                  <option value="YEAR">per year</option>
                  <option value="HOUR">per hour</option>
                </select>
              </div>
              <p style={S.fieldHint}>We hide jobs below your minimum. Your target only nudges the ranking — you&apos;ll never lose a match for aiming high.</p>

              <div style={S.qLabel}>Work authorization (optional)</div>
              <select style={S.wideInput} value={workAuth} onChange={(e) => setWorkAuth(e.target.value)}>
                <option value="NOT_SPECIFIED">Rather not say</option>
                <option value="US_AUTHORIZED">Authorized to work in the US</option>
                <option value="AUTHORIZED_NEEDS_FUTURE_SPONSORSHIP">Authorized now, will need sponsorship later</option>
                <option value="NEEDS_SPONSORSHIP">Will need sponsorship</option>
              </select>
              <p style={S.fieldHint}>We won&apos;t hide jobs based on this — most postings don&apos;t say whether they sponsor. It just helps us flag it when they do.</p>
            </div>

            {error && <p style={S.error}>{error}</p>}
            <button style={btn(loading)} onClick={doSubmit} disabled={loading}>
              {loading ? "Finding your matches…" : "Show my matches →"}
            </button>
            <p style={S.footnote}>Edit any of this later from your feed.</p>
          </>
        )}
      </div>
    </main>
  );
}

const btn = (disabled: boolean): CSSProperties => ({
  width: "100%", padding: "14px 20px", marginTop: 20, fontSize: 16, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#fff",
  background: disabled ? "#c7c7d1" : INDIGO, border: "none", borderRadius: 12,
  cursor: disabled ? "default" : "pointer",
});

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK, padding: "40px 16px" },
  wrap: { maxWidth: 640, margin: "0 auto" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, marginBottom: 28 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 8px" },
  sub: { color: MUTED, fontSize: 16, margin: "0 0 20px", lineHeight: 1.5 },
  dropzone: { display: "block", border: "2px dashed #d9dcff", background: "#fff", borderRadius: 16, padding: "36px 24px", textAlign: "center", cursor: "pointer", transition: "all .15s" },
  dropzoneActive: { display: "block", border: `2px dashed ${INDIGO}`, background: "#eef0ff", borderRadius: 16, padding: "36px 24px", textAlign: "center", cursor: "pointer" },
  dropIcon: { fontSize: 30, marginBottom: 8 },
  dropTitle: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 6 },
  dropSub: { color: MUTED, fontSize: 13 },
  hint: { color: MUTED, fontSize: 13, textAlign: "center", marginTop: 12, lineHeight: 1.5 },
  details: { marginTop: 18 },
  summary: { color: INDIGO, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 },
  textarea: { width: "100%", minHeight: 240, padding: 16, fontSize: 14, borderRadius: 12, border: "1px solid #e2e2ea", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 16 },
  cardLabel: { fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  roleRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  roleInput: { flex: 1, minWidth: 180, padding: "10px 12px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e2ea", fontFamily: "inherit" },
  parsing: { border: "1px solid #e2e2ea", borderRadius: 16, background: "#fff", padding: "28px 24px", textAlign: "center" } as const,
  parseRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" } as const,
  check: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700 } as const,
  parseFile: { fontWeight: 700, fontSize: 15, wordBreak: "break-all" } as const,
  parseGot: { color: "#059669", fontSize: 14, fontWeight: 600 } as const,
  bar: { height: 6, borderRadius: 999, background: "#ececf2", overflow: "hidden", marginBottom: 14 } as const,
  barFill: { height: "100%", width: "40%", borderRadius: 999, background: INDIGO, animation: "slide 1.6s ease-in-out infinite" } as const,
  parseStep: { fontSize: 15, fontWeight: 600, marginBottom: 18 } as const,
  tip: { fontSize: 14, color: MUTED, lineHeight: 1.55, minHeight: 44, animation: "fade .5s ease", maxWidth: 380, margin: "0 auto" } as const,
  wideInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d4d4d8",
    fontSize: 15,
    background: "#fff",
  } as const,
  fieldHint: { fontSize: 12, color: MUTED, margin: "6px 0 0", lineHeight: 1.45 } as const,
  select: { padding: "10px 12px", fontSize: 15, borderRadius: 10, border: "1px solid #e2e2ea", background: "#fff", fontFamily: "inherit" },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chipSolid: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#eef0ff", color: INDIGO, border: `1px solid ${INDIGO}`, borderRadius: 999, fontSize: 14, fontWeight: 600 },
  chipDashed: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#fff", color: MUTED, border: "1px dashed #b9b9c6", borderRadius: 999, fontSize: 14, fontWeight: 600 },
  chipConfirm: { background: "#fff7ed", color: "#c2410c", border: "1px solid #fdba74", borderRadius: 999, fontSize: 11, padding: "1px 6px", cursor: "pointer" },
  chipX: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 },
  addRow: { marginTop: 6 },
  addInput: { width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 10, border: "1px solid #e2e2ea", fontFamily: "inherit", boxSizing: "border-box" },
  qLabel: { fontSize: 14, fontWeight: 700, margin: "14px 0 8px" },
  pillOn: { padding: "7px 12px", borderRadius: 999, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "7px 12px", borderRadius: 999, border: "1px solid #d9d9e3", background: "#fff", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  error: { color: "#dc2626", fontSize: 14, marginTop: 10 },
  footnote: { textAlign: "center", color: MUTED, fontSize: 13, marginTop: 12 },
};
