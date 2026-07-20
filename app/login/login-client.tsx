"use client";

/**
 * Sign up / log in — split layout ported from the "Topezia Login" design.
 *
 * Left: contextual badge (what they were trying to reach), the form, and the
 * prominent join-by-resume path. Right: dark value panel.
 *
 * Honesty adaptations from the mock: its panel cards showed "97 — your AI
 * Career Score" and "64% of roles in your field", which we cannot know about a
 * signed-out stranger. They're replaced with counted corpus numbers passed in
 * from the server (and the panel simply shows fewer cards if the DB is
 * unreachable). The mock's "Keep me signed in" checkbox is omitted rather than
 * shipped as decoration — Supabase keeps you signed in already, so the control
 * would have no state to change.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg,${C.c1},${C.c2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

const PATHS: Record<string, string[]> = {
  spark: ["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  eyeOff: ["M3 3l18 18", "M10.6 10.6a3 3 0 0 0 4.2 4.2", "M9.9 5.2A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.3 6.3A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 3.6-.7"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  upload: ["M4 16v4h16v-4", "M12 4v11", "M8 8l4-4 4 4"],
};
function Ic({ n, s = 15 }: { n: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {(PATHS[n] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export interface LoginStats { jobs: number; projects: number }
/** Someone we already recognise on this device — greet them by name. */
export interface Viewer { firstName: string; photoUrl: string | null; hasAccount: boolean }

const initialsOf = (name: string) => name.slice(0, 2).toUpperCase();

/** What they were trying to reach, for the badge + panel eyebrow. */
const DESTINATIONS: { prefix: string; label: string; eyebrow: string }[] = [
  { prefix: "/coach", label: "Career Coach", eyebrow: "Your Career Coach" },
  { prefix: "/feed", label: "your job feed", eyebrow: "Your job feed" },
  { prefix: "/projects", label: "freelance projects", eyebrow: "Freelance projects" },
  { prefix: "/profile", label: "your profile", eyebrow: "Your profile" },
  { prefix: "/settings", label: "your settings", eyebrow: "Your account" },
  { prefix: "/saved", label: "your saved jobs", eyebrow: "Your saved jobs" },
];

const CSS = `
.lg-in:focus-within{border-color:#A5B4FC!important;box-shadow:0 0 0 3px rgba(139,92,246,.12)}
.lg-btn:hover{filter:brightness(1.08)}
.lg-join:hover{border-color:#A5B4FC!important;background:#F5F3FF!important}
.lg-link:hover{color:${C.c2}!important}
@media (max-width:900px){ .lg-panel{display:none!important} .lg-left{padding:22px 20px!important} }
`;

export default function LoginClient({ next, stats, viewer }: { next: string | null; stats: LoginStats | null; viewer: Viewer | null }) {
  const router = useRouter();
  // /login means SIGN IN — that is what every "Sign in" link in the app points
  // at, so it must land on the sign-in form. The one exception is the
  // post-onboarding hand-off: a visitor with a parsed profile but no account
  // came here to create one, so open signup for them or the flow dead-ends.
  const [mode, setMode] = useState<"login" | "signup">(
    viewer && !viewer.hasAccount ? "signup" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // These inputs are controlled, and a browser/password-manager autofill writes
  // the DOM value WITHOUT firing React's onChange. The field then visibly holds
  // your address while `email` state is still "" — which is why "Forgot?"
  // answered "Enter your email first" on a filled-in form. Read the elements
  // back rather than trusting state alone.
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  // Autofill usually lands before hydration, so reconcile once on mount.
  useEffect(() => {
    const e = emailRef.current?.value;
    if (e) setEmail((cur) => cur || e);
    const p = pwRef.current?.value;
    if (p) setPassword((cur) => cur || p);
  }, []);

  const dest = next ? DESTINATIONS.find((d) => next === d.prefix || next.startsWith(`${d.prefix}/`)) : undefined;

  async function forgotPassword() {
    setError(null); setNotice(null);
    // Fall back to the live input value, for an autofill that arrived after mount.
    const addr = (email || emailRef.current?.value || "").trim();
    if (!addr) { setError("Enter your email first, then tap reset."); return; }
    if (!email) setEmail(addr);
    setLoading(true);
    try {
      // Our own endpoint, not supabase.auth.resetPasswordForEmail: that sent
      // Supabase-branded mail, and its redirectTo (window.location.origin) is
      // only honoured when allow-listed — otherwise Supabase fell back to the
      // project's Site URL and the link landed on localhost.
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't send a reset email.");
      }
      setNotice("If that email has an account, a reset link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setNotice(null);
    const supabase = createClient();
    // Same autofill caveat as forgotPassword: trust the inputs over state, or a
    // password-manager fill signs in with empty credentials.
    const addr = (email || emailRef.current?.value || "").trim();
    const pw = password || pwRef.current?.value || "";
    try {
      const { data, error } =
        mode === "signup"
          ? await supabase.auth.signUp({ email: addr, password: pw })
          : await supabase.auth.signInWithPassword({ email: addr, password: pw });
      if (error) throw error;

      // If email confirmation is on, signUp returns no session yet.
      if (mode === "signup" && !data.session) {
        setNotice("Check your email to confirm your account, then come back and log in.");
        setLoading(false);
        return;
      }

      // Link any anonymous profile to this account and route accordingly.
      const res = await fetch("/api/auth/link", { method: "POST" });
      const { hasProfile } = res.ok ? await res.json() : { hasProfile: false };
      // `next` is already validated server-side as an internal path.
      router.push(next && hasProfile ? next : hasProfile ? "/feed" : "/onboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // Counted, never invented — the panel shows only what the corpus backs.
  const perks: { big: string; text: string }[] = [];
  if (stats?.jobs) perks.push({ big: stats.jobs.toLocaleString(), text: "verified live roles, each scored against your actual experience" });
  if (stats?.projects) perks.push({ big: stats.projects.toLocaleString(), text: "freelance projects you can bid on, matched the same way" });
  perks.push({ big: "2 min", text: "from resume upload to your profile, score and roadmap" });

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT, color: C.ink, background: "#fff" }}>
      <style>{CSS}</style>

      {/* ── Left: form ── */}
      <div className="lg-left" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "28px 40px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: C.ink, textDecoration: "none" }}>
          <svg width="34" height="25" viewBox="0 0 36 26" aria-hidden>
            <defs><linearGradient id="lgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs>
            <circle cx="10.5" cy="13" r="7.2" stroke="url(#lgg)" strokeWidth="4.2" fill="none" />
            <circle cx="25.5" cy="13" r="7.2" stroke="url(#lgg)" strokeWidth="4.2" fill="none" />
          </svg>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span>
        </Link>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
          <form style={{ width: "100%", maxWidth: 380 }} onSubmit={submit}>
            {dest && (
              <div style={S.badge}><Ic n="spark" s={13} />Sign in to continue to {dest.label}</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {viewer && (
                viewer.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewer.photoUrl} alt="" style={S.avatar} />
                ) : (
                  <div style={{ ...S.avatar, background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 800 }}>
                    {initialsOf(viewer.firstName)}
                  </div>
                )
              )}
              <h1 style={{ margin: 0, fontSize: 29, fontWeight: 800, letterSpacing: "-0.9px" }}>
                {viewer
                  ? mode === "signup" ? `Almost there, ${viewer.firstName}` : `Welcome back, ${viewer.firstName}`
                  : mode === "signup" ? "Create your account" : "Welcome back"}
              </h1>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13.5, color: C.mut, lineHeight: 1.6 }}>
              {mode === "signup"
                ? viewer
                  ? "Create an account to keep your profile, score and matches — on every device."
                  : "Save your matches, score and roadmap so they follow you across devices."
                : "Your roadmap, career score and matched roles are waiting."}
              {viewer && (
                <>
                  {" "}
                  <a href="/api/auth/forget" className="lg-link" style={{ color: C.c1, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>Not you?</a>
                </>
              )}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
              <div>
                <label htmlFor="lg-email" style={S.label}>Email</label>
                <div className="lg-in" style={S.inputWrap}>
                  <Ic n="mail" />
                  <input id="lg-email" ref={emailRef} style={S.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
                  <label htmlFor="lg-pw" style={{ ...S.label, flex: 1, marginBottom: 0 }}>Password</label>
                  {mode === "login" && (
                    <button type="button" className="lg-link" style={S.forgot} onClick={forgotPassword} disabled={loading}>Forgot?</button>
                  )}
                </div>
                <div className="lg-in" style={S.inputWrap}>
                  <Ic n="lock" />
                  <input id="lg-pw" ref={pwRef} style={S.input} type={showPw ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} style={S.eyeBtn}>
                    <Ic n={showPw ? "eyeOff" : "eye"} />
                  </button>
                </div>
              </div>

              {error && <p style={S.error}>{error}</p>}
              {notice && <p style={S.notice}>{notice}</p>}

              <button type="submit" className="lg-btn" style={{ ...S.submit, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                {loading ? "…" : mode === "signup" ? "Create account" : "Sign in"}
                {!loading && <Ic n="arrow" />}
              </button>
            </div>

            <p style={S.consent}>
              By {mode === "signup" ? "creating an account" : "continuing"} you agree to our{" "}
              <Link href="/terms" className="lg-link" style={S.consentLink}>Terms</Link> and{" "}
              <Link href="/privacy" className="lg-link" style={S.consentLink}>Privacy Policy</Link>.
            </p>

            {/* Only shown in signup mode. In login mode the pairing read as a
                contradiction ("Have a password already? Create an account"),
                and newcomers there are served by the join CTA below. */}
            {mode === "signup" && (
              <p style={S.toggle}>
                Already have an account?{" "}
                <button type="button" className="lg-link" style={S.toggleBtn} onClick={() => { setMode("login"); setError(null); setNotice(null); }}>
                  Log in
                </button>
              </p>
            )}

            {/* The front door for newcomers: joining IS uploading your resume. */}
            <div style={S.orRow}><span style={S.orLine} /><span style={S.orText}>New to Topezia?</span><span style={S.orLine} /></div>
            <Link href="/onboard" className="lg-join" style={S.join}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: GRAD, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Ic n="upload" s={16} /></span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: C.ink }}>Join free — upload your resume</span>
                <span style={{ display: "block", fontSize: 12, color: C.mut, marginTop: 3, lineHeight: 1.5 }}>Our AI builds your profile and career score in 2 minutes.</span>
              </span>
              <span style={{ color: C.c1, flex: "none" }}><Ic n="arrow" s={14} /></span>
            </Link>
          </form>
        </div>

        <div style={{ fontSize: 11, color: C.mut }}>
          © 2026 Topezia · <Link href="/privacy" className="lg-link" style={{ color: C.mut, textDecoration: "none" }}>Privacy</Link> · <Link href="/terms" className="lg-link" style={{ color: C.mut, textDecoration: "none" }}>Terms</Link>
        </div>
      </div>

      {/* ── Right: value panel (image slots in when we have one) ── */}
      <div className="lg-panel" style={S.panel}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.3, mixBlendMode: "luminosity", WebkitMaskImage: "linear-gradient(to bottom, transparent, rgba(0,0,0,1) 30%, rgba(0,0,0,1) 70%, transparent)", maskImage: "linear-gradient(to bottom, transparent, rgba(0,0,0,1) 30%, rgba(0,0,0,1) 70%, transparent)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/login-panel.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, rgba(15,23,42,.75), rgba(30,27,75,.6))" }} />
        <div style={{ position: "absolute", top: -140, right: -90, width: 440, height: 440, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.40), transparent 68%)" }} />
        <div style={{ position: "absolute", bottom: -160, left: -60, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,.26), transparent 68%)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: "#A5B4FC", textTransform: "uppercase", marginBottom: 16 }}>
            {dest?.eyebrow ?? "Why Topezia"}
          </div>
          <h2 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.24 }}>
            See exactly where you stand — then the roadmap up.
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
            {perks.map((pk) => (
              <div key={pk.text} style={S.perk}>
                <div style={S.perkBig}>{pk.big}</div>
                <div style={{ fontSize: 12.5, color: "#C7CEE4", lineHeight: 1.5 }}>{pk.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  badge: { display: "inline-flex", alignItems: "center", gap: 8, background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4F46E5", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "6px 13px", marginBottom: 20 },
  avatar: { width: 52, height: 52, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", flex: "none", border: `2px solid ${C.line}` },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 6 },
  inputWrap: { display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 14px", color: C.mut, background: "#fff", transition: "border-color .15s, box-shadow .15s" },
  input: { flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 13.5, fontFamily: "inherit", color: C.ink, background: "transparent" },
  eyeBtn: { border: "none", background: "none", color: C.mut, cursor: "pointer", padding: 0, display: "grid", placeItems: "center" },
  forgot: { border: "none", background: "none", color: C.c1, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 },
  submit: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: GRAD, color: "#fff", border: "none", borderRadius: 11, padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 8px 22px rgba(99,102,241,.35)", marginTop: 4, fontFamily: "inherit" },
  error: { color: "#dc2626", fontSize: 13, margin: 0, lineHeight: 1.5 },
  notice: { color: "#059669", fontSize: 13, margin: 0, lineHeight: 1.5 },
  consent: { textAlign: "center", color: C.mut, fontSize: 11.5, marginTop: 14, lineHeight: 1.5 },
  consentLink: { color: C.c1, fontWeight: 600, textDecoration: "none" },
  toggle: { textAlign: "center", color: C.mut, fontSize: 13, marginTop: 14 },
  toggleBtn: { background: "none", border: "none", color: C.c1, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 },
  orRow: { display: "flex", alignItems: "center", gap: 12, margin: "22px 0 12px" },
  orLine: { flex: 1, height: 1, background: C.line },
  orText: { color: C.mut, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  join: { display: "flex", alignItems: "center", gap: 13, border: `1.5px solid ${C.line}`, borderRadius: 13, padding: "13px 15px", textDecoration: "none", background: "#fff", transition: "border-color .2s, background .2s" },
  panel: { flex: 1, maxWidth: 520, background: "#0F172A", color: "#fff", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", padding: "52px 48px" },
  perk: { display: "flex", alignItems: "center", gap: 13, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 13, padding: "14px 17px" },
  perkBig: { fontSize: 20, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", minWidth: 56 },
};
