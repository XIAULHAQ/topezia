"use client";

/**
 * /reset — set a new password after clicking the emailed reset link.
 *
 * Our reset mail (see app/api/auth/reset) links straight here with the recovery
 * token in `?token_hash=`, rather than bouncing through Supabase's verify
 * endpoint — that endpoint only honours allow-listed redirects and otherwise
 * falls back to the project's Site URL, which is how these links ended up on
 * localhost. So the exchange happens here: verifyOtp turns the token into a
 * session, and then updateUser can set the password.
 *
 * Still tolerates arriving with a session already established, which is what
 * happens for any older Supabase-issued link still sitting in someone's inbox.
 */
import { Suspense, useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // A token in the URL is the normal path now: exchange it for a recovery
      // session. Strip it from the address bar straight after, so the one-shot
      // token isn't left sitting in history or copied out of a shared URL.
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        window.history.replaceState({}, "", "/reset");
        if (!error) {
          setReady(true);
          setChecking(false);
          return;
        }
      }
      // Otherwise fall back to an already-established session (an older
      // Supabase-issued link, or a page refresh after the exchange).
      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
      setChecking(false);
    })();
  }, [tokenHash]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push("/feed"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password.");
      setLoading(false);
    }
  }

  return (
    <main style={S.page}>
      <form style={S.card} onSubmit={submit}>
        <Link href="/" style={S.brand}>topezia</Link>
        <h1 style={S.h1}>Set a new password</h1>

        {done ? (
          <p style={S.notice}>Password updated. Taking you to your feed…</p>
        ) : checking ? (
          <p style={S.sub}>Checking your reset link…</p>
        ) : !ready ? (
          <p style={S.sub}>This reset link is invalid or expired. Request a fresh one from the <Link href="/login" style={S.link}>login page</Link>.</p>
        ) : (
          <>
            <p style={S.sub}>Pick a new password for your account.</p>
            <label style={S.label}>New password</label>
            <input style={S.input} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
            {error && <p style={S.error}>{error}</p>}
            <button style={btn(loading)} type="submit" disabled={loading}>{loading ? "…" : "Update password"}</button>
          </>
        )}
      </form>
    </main>
  );
}

// useSearchParams needs a Suspense boundary, or the whole route opts out of
// static rendering at build time.
export default function ResetPage() {
  return (
    <Suspense fallback={<main style={S.page}><div style={S.card}><p style={S.sub}>Loading…</p></div></main>}>
      <ResetForm />
    </Suspense>
  );
}

const btn = (disabled: boolean): CSSProperties => ({
  width: "100%", padding: "13px 20px", marginTop: 18, fontSize: 16, fontWeight: 700,
  fontFamily: "var(--font-jakarta), sans-serif", color: "#fff",
  background: disabled ? "#c7c7d1" : INDIGO, border: "none", borderRadius: 12, cursor: disabled ? "default" : "pointer",
});

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "var(--font-jakarta), sans-serif", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 400, background: "#fff", border: "1px solid #ececf2", borderRadius: 20, padding: 32 },
  brand: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none", display: "inline-block", marginBottom: 20 },
  h1: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 26, margin: "0 0 6px" },
  sub: { color: MUTED, fontSize: 15, margin: "0 0 20px", lineHeight: 1.5 },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: MUTED, margin: "12px 0 6px" },
  input: { width: "100%", padding: "11px 13px", fontSize: 15, borderRadius: 10, border: "1px solid #e2e2ea", fontFamily: "inherit", boxSizing: "border-box" },
  error: { color: "#dc2626", fontSize: 14, marginTop: 12 },
  notice: { color: "#059669", fontSize: 15, lineHeight: 1.5 },
  link: { color: INDIGO, fontWeight: 700, textDecoration: "none" },
};
