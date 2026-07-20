"use client";

/** Password form for /hq. Posts to /api/hq/login, which sets the session cookie. */
import { useState, type CSSProperties, type FormEvent } from "react";

export default function HqLogin({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hq/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Sign-in failed.");
        setBusy(false);
        return;
      }
      window.location.reload(); // cookie is set; the server gate now renders the dashboard
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <main style={S.page}>
      <form style={S.card} onSubmit={submit}>
        <svg width="34" height="25" viewBox="0 0 36 26" aria-hidden style={{ marginBottom: 18 }}>
          <defs><linearGradient id="hqg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#3B82F6" /></linearGradient></defs>
          <circle cx="10.5" cy="13" r="7.2" stroke="url(#hqg)" strokeWidth="4.2" fill="none" />
          <circle cx="25.5" cy="13" r="7.2" stroke="url(#hqg)" strokeWidth="4.2" fill="none" />
        </svg>
        <h1 style={S.h1}>Topezia HQ</h1>
        <p style={S.sub}>Internal dashboard. Enter the password to continue.</p>

        {!configured ? (
          <p style={S.warn}>
            No dashboard password is set on the server. Set <code style={S.code}>ADMIN_PASSWORD</code> in the
            environment and redeploy — until then this gate stays closed.
          </p>
        ) : (
          <>
            <label htmlFor="hq-pw" style={S.label}>Password</label>
            <input
              id="hq-pw"
              style={S.input}
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
            {error && <p style={S.error}>{error}</p>}
            <button type="submit" disabled={busy || !password} style={{ ...S.btn, opacity: busy || !password ? 0.6 : 1 }}>
              {busy ? "Checking…" : "Sign in"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Sora', system-ui, sans-serif", color: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 18, padding: 30 },
  h1: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 },
  sub: { fontSize: 13, color: "#64748B", margin: "8px 0 22px", lineHeight: 1.6 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 },
  input: { width: "100%", padding: "11px 14px", fontSize: 14, borderRadius: 11, border: "1px solid #E2E8F0", fontFamily: "inherit", outline: "none" },
  btn: { width: "100%", marginTop: 16, padding: "12px 20px", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  error: { color: "#dc2626", fontSize: 13, margin: "12px 0 0", lineHeight: 1.5 },
  warn: { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.6, margin: 0 },
  code: { background: "#FEF3C7", padding: "1px 5px", borderRadius: 4, fontSize: 12.5 },
};
