"use client";

/**
 * "Tailor my resume for this job" — sits next to the apply block on every
 * job page (native or external; tailoring is independent of how the
 * application itself happens, since most postings send the person off to
 * apply on the employer's own site with whatever resume they download here).
 *
 * Same signed-out pattern as ApplyBox.tsx. Premium-gated server-side
 * (POST /api/resume/tailor returns 402) rather than pre-checked here — one
 * fewer fetch on page load, and the upgrade prompt only needs to appear on
 * the rare click from a free-tier viewer.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function TailorButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session)).catch(() => {});
  }, []);

  async function tailor() {
    setBusy(true);
    setError(null);
    setUpgrade(false);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.status === 402) { setUpgrade(true); setBusy(false); return; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error);
      router.push(`/resume?job=${jobId}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't tailor that resume — try again.");
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div style={S.box}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Tailor your resume for this job</div>
        <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 10px" }}>Reorder your skills and experience to speak to this posting, then download it to apply.</div>
        <Link href={`/login?next=/job/${jobId}`} style={S.ghostBtn}>Sign in to tailor your resume →</Link>
      </div>
    );
  }

  if (upgrade) {
    return (
      <div style={S.box}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Tailor your resume for this job</div>
        <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 10px" }}>Tailoring a resume to a specific posting is a Premium feature.</div>
        <Link href="/pricing" style={S.ghostBtn}>See Premium →</Link>
      </div>
    );
  }

  return (
    <div style={S.box}>
      <button type="button" onClick={tailor} disabled={busy} style={{ ...S.ghostBtn, border: "none", cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
        {busy ? "Tailoring…" : "Tailor my resume for this job →"}
      </button>
      {error && <div style={{ color: "#b42318", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  box: { border: "1px solid #e5e7eb", background: "#F8FAFC", borderRadius: 14, padding: "16px 18px" },
  ghostBtn: { display: "inline-block", background: "#fff", color: INDIGO, border: `1.5px solid ${INDIGO}`, borderRadius: 10, padding: "10.5px 22px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" },
};
