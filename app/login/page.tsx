"use client";

/**
 * Sign up / log in (email + password) — real accounts via Supabase Auth.
 * On success, links any anonymous profile to the account, then routes to the
 * feed (if they already have matches) or onboarding.
 */
import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function forgotPassword() {
    setError(null);
    setNotice(null);
    if (!email) { setError("Enter your email first, then tap reset."); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) throw error;
      setNotice("If that email has an account, a reset link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    try {
      const { data, error } =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
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
      // A `next` target (e.g. the CV-upload flow sending people to /profile/edit)
      // wins, but only when they actually have a profile to land on.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && hasProfile ? next : hasProfile ? "/feed" : "/onboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main style={S.page}>
      <form style={S.card} onSubmit={submit}>
        <Link href="/" style={S.brand}>topezia</Link>
        <h1 style={S.h1}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p style={S.sub}>
          {mode === "signup"
            ? "Save your matches so they follow you across devices."
            : "Log in to pick up where you left off."}
        </p>

        <label style={S.label}>Email</label>
        <input style={S.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label style={S.label}>Password</label>
        <input style={S.input} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />

        {error && <p style={S.error}>{error}</p>}
        {notice && <p style={S.notice}>{notice}</p>}

        <button style={btn(loading)} type="submit" disabled={loading}>
          {loading ? "…" : mode === "signup" ? "Create account" : "Log in"}
        </button>

        <p style={S.consent}>
          By {mode === "signup" ? "creating an account" : "continuing"} you agree to our{" "}
          <Link href="/terms" style={S.consentLink}>Terms</Link> and{" "}
          <Link href="/privacy" style={S.consentLink}>Privacy Policy</Link>.
        </p>

        {mode === "login" && (
          <p style={{ ...S.toggle, marginTop: 12 }}>
            <button type="button" style={S.toggleBtn} onClick={forgotPassword} disabled={loading}>Forgot password?</button>
          </p>
        )}

        <p style={S.toggle}>
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button type="button" style={S.toggleBtn} onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); setNotice(null); }}>
            {mode === "signup" ? "Log in" : "Create one"}
          </button>
        </p>
      </form>
    </main>
  );
}

const btn = (disabled: boolean): CSSProperties => ({
  width: "100%", padding: "13px 20px", marginTop: 18, fontSize: 16, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#fff",
  background: disabled ? "#c7c7d1" : INDIGO, border: "none", borderRadius: 12, cursor: disabled ? "default" : "pointer",
});

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 400, background: "#fff", border: "1px solid #ececf2", borderRadius: 20, padding: 32 },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none", display: "inline-block", marginBottom: 20 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, margin: "0 0 6px" },
  sub: { color: MUTED, fontSize: 15, margin: "0 0 20px", lineHeight: 1.5 },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: MUTED, margin: "12px 0 6px" },
  input: { width: "100%", padding: "11px 13px", fontSize: 15, borderRadius: 10, border: "1px solid #e2e2ea", fontFamily: "inherit", boxSizing: "border-box" },
  error: { color: "#dc2626", fontSize: 14, marginTop: 12 },
  notice: { color: "#059669", fontSize: 14, marginTop: 12, lineHeight: 1.4 },
  toggle: { textAlign: "center", color: MUTED, fontSize: 14, marginTop: 16 },
  toggleBtn: { background: "none", border: "none", color: INDIGO, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  consent: { textAlign: "center", color: MUTED, fontSize: 12, marginTop: 14, lineHeight: 1.5 },
  consentLink: { color: INDIGO, fontWeight: 600, textDecoration: "none" },
};
