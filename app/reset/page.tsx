"use client";

/**
 * /reset — set a new password after clicking the emailed reset link.
 *
 * Supabase's recovery link lands here with a recovery session already
 * established (the browser client picks the token out of the URL), so we just
 * collect a new password and call updateUser. No token handling of our own.
 */
import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function ResetPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Confirm we actually arrived in a recovery session; otherwise there's
    // nothing to reset and the link was stale or opened directly.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, []);

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
  notice: { color: "#059669", fontSize: 15, lineHeight: 1.5 },
  link: { color: INDIGO, fontWeight: 700, textDecoration: "none" },
};
