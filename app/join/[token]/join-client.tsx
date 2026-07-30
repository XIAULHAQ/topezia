"use client";

/**
 * The accept button and everything around it.
 *
 * Signed-out visitors are sent to /login?next=/join/{token} rather than being
 * shown a dead button — coming back to the same invite after signing in is the
 * whole journey, and losing the token in the middle of it is the most common
 * way an invitation quietly fails.
 *
 * The email mismatch is reported as its own state, with both addresses named.
 * "You can't accept this" tells someone nothing they can act on; "this went to
 * X, you're signed in as Y" tells them exactly what to do next.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Company = { name: string; slug: string; tagline: string | null; logoUrl: string | null };

export default function JoinClient({
  token,
  state,
  email,
  company,
}: {
  token: string;
  state: "missing" | "used" | "expired" | "open";
  email: string | null;
  company: Company | null;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setAuthed(Boolean(data.session)))
      .catch(() => setAuthed(false));
  }, []);

  async function accept() {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/company/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't accept that invitation.");
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't accept that invitation.");
    } finally {
      setJoining(false);
    }
  }

  if (state !== "open" || !company) {
    const copy =
      state === "used" ? "This invitation has already been used, or it was withdrawn."
      : state === "expired" ? "This invitation has expired."
      : "We can't find this invitation.";
    return (
      <div style={S.card}>
        <h1 style={S.h1}>Invitation unavailable</h1>
        <p style={S.body}>{copy} Ask whoever invited you to send a new one.</p>
        <Link href="/" style={S.btnGhost}>Go to Topezia</Link>
      </div>
    );
  }

  if (joined) {
    return (
      <div style={S.card}>
        <h1 style={S.h1}>You&apos;re on the team</h1>
        <p style={S.body}>
          You&apos;re now listed on {company.name}&apos;s company page. Filling in your profile is what makes that
          listing useful — it&apos;s what anyone clicking your name will see.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/profile" style={S.btn}>Set up my profile</Link>
          <Link href={`/company/${company.slug}`} style={S.btnGhost}>View {company.name}</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.card}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <span style={S.logo}>
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            company.name.slice(0, 2).toUpperCase()
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...S.h1, margin: 0 }}>Join {company.name}</h1>
          {company.tagline && <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B" }}>{company.tagline}</p>}
        </div>
      </div>

      <p style={S.body}>
        You&apos;ve been invited to be listed as part of {company.name}&apos;s team on Topezia. Accepting adds your name
        to their company page — it doesn&apos;t give them access to your account, and it doesn&apos;t give you access to
        theirs.
      </p>

      <p style={S.meta}>This invitation was sent to <b>{email}</b>, and only an account using that address can accept it.</p>

      {error && <div style={S.error}>{error}</div>}

      {authed === null && <p style={S.meta}>Checking your account…</p>}

      {authed === false && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} style={S.btn}>
            Sign in or create an account
          </Link>
        </div>
      )}

      {authed === true && (
        <button type="button" onClick={accept} disabled={joining} style={{ ...S.btn, opacity: joining ? 0.6 : 1, border: "none", cursor: "pointer" }}>
          {joining ? "Joining…" : `Join ${company.name}`}
        </button>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 18, padding: "30px 32px" },
  logo: { flex: "none", width: 52, height: 52, borderRadius: 13, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, color: "#64748B", overflow: "hidden", padding: 5 },
  h1: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 12px" },
  body: { fontSize: 13.8, lineHeight: 1.75, color: "#334155", margin: "0 0 14px" },
  meta: { fontSize: 12.5, lineHeight: 1.65, color: "#64748B", margin: "0 0 18px" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16, lineHeight: 1.6 },
  btn: { display: "inline-block", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", borderRadius: 11, padding: "11px 20px", fontSize: 13.5, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" },
  btnGhost: { display: "inline-block", background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" },
};
