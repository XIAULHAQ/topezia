"use client";

/**
 * Onboarding, screen A — upload/paste your résumé (spec §6.1).
 *
 * New flow: we parse the CV, persist the full parse (skills, experience,
 * education, certifications), then send you to create an account / log in, and
 * from there straight to /profile/edit to review everything we read. No
 * separate confirm screen — the profile editor IS the review surface now.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Parsed = {
  fullName: string | null;
  headlineRole: string | null;
  seniority: string;
  yearsExperience: number | null;
  skills: { name: string; confidence: number }[];
  workHistory: unknown[];
  education: unknown[];
  certifications: string[];
};

const PARSE_TIPS = [
  "Most résumés get ~7 seconds from a human recruiter. We read all of it.",
  "We score honestly — including the low scores. A 45 tells you more than a fake 90.",
  "Skills you list once and skills you've led on look identical on paper. We tell them apart.",
  "You'll see the gaps too — what a job wants that you don't have yet.",
  "We never send your résumé to employers. It stays yours.",
];
const PARSE_STEPS = ["Reading the text", "Pulling out skills and history", "Working out seniority and fit", "Almost there"];

export default function OnboardClient() {
  const router = useRouter();
  const [resumeText, setResumeText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Reading your résumé");
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!loading) { setTip(0); setPhase(0); return; }
    const t = setInterval(() => setTip((i) => (i + 1) % PARSE_TIPS.length), 3800);
    const s = setInterval(() => setPhase((i) => Math.min(i + 1, PARSE_STEPS.length - 1)), 2600);
    return () => { clearInterval(t); clearInterval(s); };
  }, [loading]);

  /** Persist the parse, then route to auth (or straight to edit if signed in). */
  async function saveAndContinue(parsed: Parsed, text: string, photo: string | null) {
    setPhaseLabel("Building your profile");
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parsed,
        resumeText: text,
        photo,
        // Preferences aren't in a résumé — the user sets them on /profile/edit.
        // Left empty so nothing is hard-filtered on an assumption.
        preferences: { employmentTypes: [], remoteTypes: [], locations: [] },
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save your profile.");

    // Already signed in? Go straight to review. Otherwise create an account
    // first — the anonymous profile we just saved links onto it at sign-in.
    let authed = false;
    try {
      const { data } = await createClient().auth.getSession();
      authed = Boolean(data.session);
    } catch { /* supabase not reachable — treat as anon */ }
    router.push(authed ? "/profile/edit" : "/login?next=/profile/edit");
  }

  async function runParse(body: BodyInit, headers?: HeadersInit) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", { method: "POST", body, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that");
      await saveAndContinue(data.parsed as Parsed, data.resumeText ?? resumeText, data.photo ?? null);
      // On success we navigate away; keep the spinner up through the redirect.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setFileName(null);
      setLoading(false);
    }
  }

  const doParseText = () => runParse(JSON.stringify({ resumeText }), { "Content-Type": "application/json" });
  function doParseFile(file: File) {
    setFileName(file.name);
    const form = new FormData();
    form.append("file", file);
    runParse(form);
  }

  return (
    <main style={S.page}>
      <style>{"@keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}@keyframes fade{from{opacity:0}to{opacity:1}}"}</style>
      <div style={S.wrap}>
        <div style={S.brand}>topezia</div>

        <h1 style={S.h1}>Upload your résumé once.</h1>
        <p style={S.sub}>
          Drop in your résumé — we&apos;ll read it, build your profile, then show you only the jobs actually
          worth your time, and tell you why.
        </p>

        {loading ? (
          <div style={S.parsing}>
            <div style={S.parseRow}>
              <span style={S.check}>✓</span>
              <span style={S.parseFile}>{fileName ?? "Your résumé"}</span>
              <span style={S.parseGot}>{fileName ? "uploaded" : "received"}</span>
            </div>
            <div style={S.bar}><div style={S.barFill} /></div>
            <div style={S.parseStep}>{phaseLabel === "Building your profile" ? "Building your profile" : `${PARSE_STEPS[phase]}`}…</div>
            <div style={S.tip} key={tip}>{PARSE_TIPS[tip]}</div>
          </div>
        ) : (
          <label
            style={dragging ? S.dropzoneActive : S.dropzone}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) doParseFile(f); }}
          >
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doParseFile(f); }}
            />
            <div style={S.dropIcon}>📄</div>
            <div style={S.dropTitle}>Drop your résumé here, or click to browse</div>
            <div style={S.dropSub}>PDF, DOCX or plain text — up to 4MB. We read it and don&apos;t keep the file.</div>
          </label>
        )}

        {!loading && (
          <>
            <p style={S.hint}>
              Only have LinkedIn? Open your profile → <strong>More</strong> → <strong>Save to PDF</strong>, and drop that in.
            </p>
            <p style={S.hint}>
              Drive for a living? <a href="/drive" style={{ color: INDIGO, fontWeight: 700, textDecoration: "none" }}>Skip the résumé — answer 8 quick questions →</a>
            </p>

            <details style={S.details}>
              <summary style={S.summary}>…or paste the text instead</summary>
              <textarea
                style={S.textarea}
                placeholder="Paste your full résumé text here…"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
              <button style={btn(resumeText.trim().length < 40)} onClick={doParseText} disabled={resumeText.trim().length < 40}>
                Parse pasted text
              </button>
            </details>
          </>
        )}

        {error && <p style={S.error}>{error}</p>}
      </div>
    </main>
  );
}

const btn = (disabled: boolean): CSSProperties => ({
  width: "100%", padding: "14px 20px", marginTop: 20, fontSize: 16, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#fff",
  background: disabled ? "#c7c7d1" : INDIGO, border: "none", borderRadius: 12, cursor: disabled ? "default" : "pointer",
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
  parsing: { border: "1px solid #e2e2ea", borderRadius: 16, background: "#fff", padding: "28px 24px", textAlign: "center" },
  parseRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  check: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700 },
  parseFile: { fontWeight: 700, fontSize: 15, wordBreak: "break-all" },
  parseGot: { color: "#059669", fontSize: 14, fontWeight: 600 },
  bar: { height: 6, borderRadius: 999, background: "#ececf2", overflow: "hidden", marginBottom: 14 },
  barFill: { height: "100%", width: "40%", borderRadius: 999, background: INDIGO, animation: "slide 1.6s ease-in-out infinite" },
  parseStep: { fontSize: 15, fontWeight: 600, marginBottom: 18 },
  tip: { fontSize: 14, color: MUTED, lineHeight: 1.55, minHeight: 44, animation: "fade .5s ease", maxWidth: 380, margin: "0 auto" },
  error: { color: "#dc2626", fontSize: 14, marginTop: 12 },
};
