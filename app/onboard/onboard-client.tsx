"use client";

/**
 * Onboarding, screen A — upload/paste your resume (spec §6.1), redesigned.
 *
 * Flow unchanged: parse the CV, persist the full parse (skills, experience,
 * education, certifications, photo), then send you to create an account / log
 * in, and from there to /profile/edit to review everything. The design adds a
 * step indicator, an upload/paste tab toggle, a polished dropzone, and a trust
 * row — but the parse → save → auth logic is exactly as before.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

const ICON: Record<string, string[]> = {
  upload: ["M4 16v4h16v-4", "M12 4v11", "M8 8l4-4 4 4"],
  paste: ["M9 4h6v3H9z", "M6 6H5v16h14V6h-1", "M9 12h6", "M9 16h4"],
  spark: ["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  shield: ["M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z", "M8.5 11.5l2.5 2.5 4.5-5"],
  zap: ["M13 2L4 14h6l-1 8 9-12h-6z"],
  gauge: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
};
function Ic({ n, s = 16, color }: { n: string; s?: number; color?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {(ICON[n] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

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
  "Most resumes get ~7 seconds from a human recruiter. We read all of it.",
  "We score honestly — including the low scores. A 45 tells you more than a fake 90.",
  "Skills you list once and skills you've led on look identical on paper. We tell them apart.",
  "You'll see the gaps too — what a job wants that you don't have yet.",
  "We never send your resume to employers. It stays yours.",
];
const PARSE_STEPS = ["Reading the text", "Pulling out skills and history", "Working out seniority and fit", "Almost there"];

/**
 * Phone layout: the step rail goes first (it is progress decoration on a
 * one-step screen), then the hero and paddings come down so nothing overflows
 * a 360px viewport.
 *
 * Injected via dangerouslySetInnerHTML, not as a text child: React escapes
 * apostrophes and angle brackets in text content on the SERVER only, so any
 * such character inside a style child throws a hydration mismatch.
 */
const OB_CSS = `
@keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@media (max-width:760px){
  .ob-steps{display:none!important}
  .ob-h1{font-size:29px!important;letter-spacing:-0.8px!important}
  .ob-sub{font-size:14px!important}
  .ob-head{padding:0 16px!important}
  .ob-main{padding:22px 16px 52px!important}
  .ob-drop{padding:34px 18px!important}
  .ob-tabs{flex-wrap:wrap}
  .ob-parsing{padding:26px 18px!important}
  .ob-trust{gap:14px!important;margin-top:32px!important}
}
@media (max-width:420px){
  .ob-h1{font-size:25px!important}
  .ob-tab{flex:1;justify-content:center}
}
`;

export default function OnboardClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [armed, setArmed] = useState(false); // dropzone stays greyed until clicked / armed
  const [resumeText, setResumeText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Reading your resume");
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState(0);
  const [phase, setPhase] = useState(0);
  const [longWait, setLongWait] = useState(false); // parse running >7s — likely a scanned PDF

  useEffect(() => {
    if (!loading) { setTip(0); setPhase(0); setLongWait(false); return; }
    const t = setInterval(() => setTip((i) => (i + 1) % PARSE_TIPS.length), 3800);
    const s = setInterval(() => setPhase((i) => Math.min(i + 1, PARSE_STEPS.length - 1)), 2600);
    // Scanned (image-only) PDFs go through vision parsing, which takes an
    // extra 10-20s. We can't know it's a scan until the server answers, so
    // after 7s we explain the likely reason prominently instead of looking
    // stuck.
    const w = setTimeout(() => setLongWait(true), 7000);
    return () => { clearInterval(t); clearInterval(s); clearTimeout(w); };
  }, [loading]);

  async function saveAndContinue(parsed: Parsed, text: string, photo: string | null) {
    setPhaseLabel("Building your profile");
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parsed,
        resumeText: text,
        photo,
        preferences: { employmentTypes: [], remoteTypes: [], locations: [] },
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save your profile.");
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

  const STEPS: [string, boolean][] = [["Resume", true], ["Review", false], ["Your score", false]];

  return (
    <div style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: OB_CSS }} />

      <header style={{ padding: "20px 0" }}>
        <div className="ob-head" style={S.headerInner}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: C.ink, textDecoration: "none" }}>
            <svg width="34" height="25" viewBox="0 0 36 26"><defs><linearGradient id="obg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs><circle cx="10.5" cy="13" r="7.2" stroke="url(#obg)" strokeWidth="4.2" fill="none" /><circle cx="25.5" cy="13" r="7.2" stroke="url(#obg)" strokeWidth="4.2" fill="none" /></svg>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span>
          </a>
          <div style={{ flex: 1 }} />
          <div className="ob-steps" style={S.steps}>
            {STEPS.map(([label, active], i) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={active ? S.stepNumOn : S.stepNumOff}>{i + 1}</span>
                <span style={{ fontWeight: active ? 600 : 400, color: active ? C.ink : C.mut }}>{label}</span>
                {i < STEPS.length - 1 && <span style={{ width: 26, height: 1.5, background: C.line, margin: "0 2px" }} />}
              </span>
            ))}
          </div>
          <a href="/login" style={S.signIn}>Sign in</a>
        </div>
      </header>

      <main className="ob-main" style={S.main}>
        <h1 className="ob-h1" style={S.h1}>Upload your resume <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>once.</span></h1>
        <p className="ob-sub" style={S.sub}>Drop in your resume — we&apos;ll read it, build your profile, then show you only the jobs actually worth your time, and tell you why.</p>

        {loading ? (
          <div className="ob-parsing" style={S.parsing}>
            <div style={S.parseRow}>
              <span style={S.check}>✓</span>
              <span style={{ fontWeight: 700, fontSize: 15, wordBreak: "break-all" }}>{fileName ?? "Your resume"}</span>
              <span style={{ color: "#059669", fontSize: 14, fontWeight: 600 }}>{fileName ? "uploaded" : "received"}</span>
            </div>
            <div style={S.bar}><div style={S.barFill} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{phaseLabel === "Building your profile" ? "Building your profile" : PARSE_STEPS[phase]}…</div>
            {longWait && phaseLabel !== "Building your profile" && fileName?.toLowerCase().endsWith(".pdf") && (
              <div style={S.scanNote}>
                <strong style={{ display: "block", marginBottom: 4 }}>Taking a little longer — hang tight.</strong>
                Your PDF looks like a scanned or image-based file, so we&apos;re reading the pages the way a person
                would. That adds 10–20 seconds. Don&apos;t refresh — everything still imports, including your photo.
              </div>
            )}
            <div style={S.tip} key={tip}>{PARSE_TIPS[tip]}</div>
          </div>
        ) : (
          <>
            <div className="ob-tabs" style={{ display: "flex", gap: 8, marginTop: 28 }}>
              <button onClick={() => { setMode("upload"); setArmed(true); }} className="ob-tab" style={mode === "upload" ? S.tabOn : S.tabOff}><Ic n="upload" s={14} />Upload a file</button>
              <button onClick={() => setMode("paste")} className="ob-tab" style={mode === "paste" ? S.tabOn : S.tabOff}><Ic n="paste" s={14} />Paste the text</button>
            </div>

            {mode === "upload" ? (
              // Greyed until the person clicks the box (or the "Upload a file" tab),
              // then it lights up as the active dropzone.
              <label
                className="ob-drop" style={!armed ? S.dropGrey : dragging ? S.dropActive : S.drop}
                onClick={() => setArmed(true)}
                onDragOver={(e) => { e.preventDefault(); setArmed(true); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) doParseFile(f); }}
              >
                <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) doParseFile(f); }} />
                {armed && <div style={S.dropGlow} />}
                <div style={{ position: "relative" }}>
                  <div style={armed ? S.dropIcon : S.dropIconGrey}><Ic n="upload" s={26} /></div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px", color: armed ? C.ink : "#94A3B8" }}>Drop your resume here, or click to browse</div>
                  <div style={{ fontSize: 13, color: C.mut, marginTop: 8 }}>PDF, DOCX or plain text — up to 4MB. We read it and don&apos;t keep the file.</div>
                  <div style={armed ? S.chooseBtn : S.chooseBtnGrey}>Choose a file</div>
                </div>
              </label>
            ) : (
              <div style={S.pasteCard}>
                <textarea
                  style={S.textarea}
                  placeholder="Paste your resume text here — straight from a doc, an email, or your LinkedIn profile…"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                />
                <div style={{ display: "flex", alignItems: "center", marginTop: 14, gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11.5, color: C.mut }}>Formatting doesn&apos;t matter — our AI sorts it out.</div>
                  <div style={{ flex: 1 }} />
                  <button onClick={doParseText} disabled={resumeText.trim().length < 40} style={resumeText.trim().length < 40 ? S.analyzeOff : S.analyze}>Analyze my resume</button>
                </div>
              </div>
            )}

            <div style={S.badge}><Ic n="spark" s={13} />Either way, AI builds your profile + career score in 2 minutes</div>

            <p style={{ fontSize: 13, color: C.slate, lineHeight: 1.6, textAlign: "center", margin: "26px 0 0" }}>
              Drive for a living? <a href="/drive" style={{ color: C.c1, fontWeight: 700, textDecoration: "none" }}>Skip the resume — answer 8 quick questions →</a>
            </p>
          </>
        )}

        {error && <p style={{ color: "#dc2626", fontSize: 14, marginTop: 16, textAlign: "center" }}>{error}</p>}

        <div className="ob-trust" style={S.trust}>
          <span style={S.trustItem}><Ic n="shield" s={15} color={C.mut} />Your data stays private</span>
          <span style={S.trustItem}><Ic n="zap" s={15} color={C.mut} />Profile ready in ~2 minutes</span>
          <span style={S.trustItem}><Ic n="gauge" s={15} color={C.mut} />Free AI career score included</span>
        </div>
        <p style={{ textAlign: "center", fontSize: 11.5, color: C.mut, marginTop: 18, lineHeight: 1.5 }}>
          By continuing, you agree to our <a href="/terms" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>Terms</a> and <a href="/privacy" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>Privacy Policy</a>.
        </p>
      </main>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#F8FAFF,#F1F5F9)", fontFamily: FONT, color: C.ink },
  headerInner: { maxWidth: 860, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 14, width: "100%" },
  steps: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mut, flexWrap: "wrap" },
  signIn: { flex: "none", marginLeft: 8, background: "#fff", border: `1px solid ${C.line}`, color: C.slate, borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" },
  stepNumOn: { width: 24, height: 24, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 },
  stepNumOff: { width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${C.line}`, color: C.mut, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 },
  main: { flex: 1, width: "100%", maxWidth: 860, margin: "0 auto", padding: "28px 24px 64px" },
  h1: { margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-1.3px", lineHeight: 1.15 },
  sub: { margin: "14px 0 0", fontSize: 15, lineHeight: 1.65, color: C.mut, maxWidth: 600 },
  tabOn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", background: GRAD, color: "#fff", border: "1px solid transparent", boxShadow: "0 5px 14px rgba(99,102,241,.3)", fontFamily: FONT },
  tabOff: { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: C.slate, border: `1px solid ${C.line}`, fontFamily: FONT },
  drop: { display: "block", marginTop: 16, background: "#fff", border: "2px dashed #C7D2FE", borderRadius: 20, padding: "52px 32px", textAlign: "center", cursor: "pointer", transition: "border-color .2s, box-shadow .2s", position: "relative", overflow: "hidden" },
  dropActive: { display: "block", marginTop: 16, background: "#fff", border: `2px dashed ${C.c1}`, borderRadius: 20, padding: "52px 32px", textAlign: "center", cursor: "pointer", boxShadow: "0 16px 40px rgba(99,102,241,.12)", position: "relative", overflow: "hidden" },
  dropGrey: { display: "block", marginTop: 16, background: "#F8FAFC", border: "2px dashed #E2E8F0", borderRadius: 20, padding: "52px 32px", textAlign: "center", cursor: "pointer", transition: "border-color .2s, background .2s", position: "relative", overflow: "hidden" },
  dropGlow: { position: "absolute", top: -100, right: -80, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.08), transparent 68%)" },
  dropIcon: { width: 62, height: 62, borderRadius: 17, background: GRAD, color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 18px", boxShadow: "0 10px 26px rgba(99,102,241,.35)" },
  dropIconGrey: { width: 62, height: 62, borderRadius: 17, background: "#E2E8F0", color: "#94A3B8", display: "grid", placeItems: "center", margin: "0 auto 18px" },
  chooseBtn: { display: "inline-block", marginTop: 22, background: GRAD, color: "#fff", borderRadius: 11, padding: "12px 26px", fontSize: 13.5, fontWeight: 600, boxShadow: "0 8px 22px rgba(99,102,241,.35)" },
  chooseBtnGrey: { display: "inline-block", marginTop: 22, background: "#E2E8F0", color: "#64748B", borderRadius: 11, padding: "12px 26px", fontSize: 13.5, fontWeight: 600 },
  pasteCard: { marginTop: 16, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: 20, boxShadow: "0 8px 24px rgba(15,23,42,.06)" },
  textarea: { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 12, minHeight: 200, padding: "14px 16px", fontSize: 13, color: C.ink, lineHeight: 1.6, fontFamily: FONT, resize: "vertical" },
  analyze: { background: GRAD, color: "#fff", borderRadius: 10, padding: "11px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 6px 16px rgba(99,102,241,.3)", border: "none", fontFamily: FONT },
  analyzeOff: { background: "#c7c7d1", color: "#fff", borderRadius: 10, padding: "11px 24px", fontSize: 13, fontWeight: 600, cursor: "default", border: "none", fontFamily: FONT },
  badge: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4F46E5", fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "7px 16px" },
  trust: { display: "flex", gap: 26, justifyContent: "center", marginTop: 44, paddingTop: 26, borderTop: `1px solid ${C.line}`, flexWrap: "wrap" },
  trustItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mut },
  parsing: { marginTop: 28, border: `1px solid ${C.line}`, borderRadius: 20, background: "#fff", padding: "36px 28px", textAlign: "center", boxShadow: "0 8px 24px rgba(15,23,42,.06)" },
  scanNote: { background: "#F5F3FF", border: "1.5px solid #C4B5FD", borderRadius: 12, padding: "14px 18px", fontSize: 13.5, color: "#4C1D95", lineHeight: 1.55, textAlign: "left", margin: "0 auto 18px", maxWidth: 460, animation: "fade .4s ease" },
  parseRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  check: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700 },
  bar: { height: 6, borderRadius: 999, background: "#ececf2", overflow: "hidden", marginBottom: 14, maxWidth: 420, marginLeft: "auto", marginRight: "auto" },
  barFill: { height: "100%", width: "40%", borderRadius: 999, background: GRAD, animation: "slide 1.6s ease-in-out infinite" },
  tip: { fontSize: 14, color: C.mut, lineHeight: 1.55, minHeight: 44, animation: "fade .5s ease", maxWidth: 400, margin: "0 auto" },
};
