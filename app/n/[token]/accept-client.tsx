"use client";

/**
 * What someone sees after clicking an invitation in their inbox.
 *
 * The person on this page has never used Topezia and did not ask to be here, so
 * the page leads with WHO invited them and WHAT accepting does, and it offers a
 * way out that is as prominent as the way in. There is no dark pattern here: no
 * pre-checked "also invite my contacts", no forced signup before they can see
 * who is asking, and the decline link is a real link, not grey text.
 *
 * Signing in is required to ACCEPT (a connection needs two accounts), but not
 * to LOOK — the inviter's name and headline load either way, so nobody has to
 * create an account to find out who wanted them.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { C, GRAD, initials } from "@/app/_components/ui";

type Data = {
  expired: boolean;
  accepted: boolean;
  invitedEmail: string;
  invitedName: string | null;
  inviter: { name: string | null; photoUrl: string | null; publicSlug: string | null; headline: string | null; location: string | null };
  signedIn: boolean;
};

const CARD: React.CSSProperties = {
  background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18,
  padding: "34px 28px", maxWidth: 460, margin: "0 auto", textAlign: "center",
};
const BTN_PRIMARY: React.CSSProperties = {
  background: GRAD, color: "#fff", border: "1px solid transparent", borderRadius: 10,
  padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};

export default function AcceptClient({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<{ name: string | null; slug: string | null } | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      const res = await fetch(`/api/network/accept?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<Data> & { error?: string };
      if (stop) return;
      if (!res.ok) { setError(body.error ?? "That invitation link isn't valid."); return; }
      setData(body as Data);
    })();
    return () => { stop = true; };
  }, [token]);

  const accept = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/network/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { connected?: boolean; with?: string; slug?: string; error?: string; authGate?: boolean };
      if (!res.ok) { setError(body.error ?? "That didn't work."); return; }
      setConnected({ name: body.with ?? null, slug: body.slug ?? null });
    } finally {
      setBusy(false);
    }
  }, [token]);

  if (error && !data) {
    return (
      <div style={CARD}>
        <h1 style={{ fontSize: 20, color: C.ink, margin: "0 0 10px" }}>{error}</h1>
        <p style={{ color: C.mut, fontSize: 14, margin: "0 0 20px" }}>
          It may have expired, or already been used.
        </p>
        <Link href="/" style={BTN_PRIMARY}>See what Topezia is</Link>
      </div>
    );
  }

  if (!data) return <div style={{ ...CARD, color: C.mut, fontSize: 14 }}>Loading…</div>;

  const who = data.inviter.name?.trim() || "Someone";

  if (connected) {
    return (
      <div style={CARD}>
        <h1 style={{ fontSize: 21, color: C.ink, margin: "0 0 8px" }}>
          You're connected with {connected.name ?? who}
        </h1>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
          {connected.slug ? (
            <Link href={`/p/${connected.slug}`} style={BTN_PRIMARY}>See their profile</Link>
          ) : null}
          <Link href="/network" style={{ ...BTN_PRIMARY, background: "#fff", color: C.slate, border: `1px solid ${C.line}` }}>
            Your network
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        {data.inviter.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.inviter.photoUrl} alt="" width={76} height={76}
            style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", border: `1px solid ${C.line}` }} />
        ) : (
          <div style={{
            width: 76, height: 76, borderRadius: "50%", background: GRAD, color: "#fff",
            fontWeight: 700, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {initials(data.inviter.name)}
          </div>
        )}
      </div>

      <h1 style={{ fontSize: 21, fontWeight: 800, color: C.ink, margin: "0 0 6px", lineHeight: 1.3 }}>
        {who} wants to connect with you
      </h1>
      {data.inviter.headline || data.inviter.location ? (
        <p style={{ color: C.mut, fontSize: 14, margin: "0 0 4px" }}>
          {[data.inviter.headline, data.inviter.location].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <p style={{ color: C.mut, fontSize: 13, margin: "6px 0 22px" }}>
        Invited {data.invitedEmail}
      </p>

      {data.expired ? (
        <>
          <p style={{ color: C.mut, fontSize: 14.5, margin: "0 0 18px" }}>
            This invitation has expired. You can still join and connect with {who} yourself.
          </p>
          <Link href="/join" style={BTN_PRIMARY}>See what Topezia is</Link>
        </>
      ) : data.accepted ? (
        <>
          <p style={{ color: C.mut, fontSize: 14.5, margin: "0 0 18px" }}>You've already accepted this one.</p>
          <Link href="/network" style={BTN_PRIMARY}>Your network</Link>
        </>
      ) : data.signedIn ? (
        <>
          <button style={{ ...BTN_PRIMARY, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={accept}>
            {busy ? "Connecting…" : `Connect with ${who.split(" ")[0]}`}
          </button>
          {error ? <p style={{ color: "#991B1B", fontSize: 13, margin: "14px 0 0" }}>{error}</p> : null}
        </>
      ) : (
        <>
          <Link href={`/join?next=${encodeURIComponent(`/n/${token}`)}`} style={BTN_PRIMARY}>
            Join and connect
          </Link>
          <p style={{ color: C.mut, fontSize: 13, margin: "14px 0 0" }}>
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(`/n/${token}`)}`} style={{ color: C.c1, fontWeight: 600 }}>Sign in</Link>
          </p>
        </>
      )}

      <p style={{ color: C.mut, fontSize: 12.5, margin: "24px 0 0", lineHeight: 1.6, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
        {who} had your address in their contacts. Nothing is shared with them unless you accept.{" "}
        {/* As prominent as the accept path, by design. */}
        <a href={`/api/network/unsubscribe?token=${encodeURIComponent(token)}`} style={{ color: C.mut, textDecoration: "underline" }}>
          Don't email me again
        </a>
        .
      </p>
    </div>
  );
}
