"use client";

/**
 * Gates the outbound "Apply on company site" link behind an account.
 *
 * Client-side by necessity: the job page is `revalidate = 900`, so one cached
 * HTML document is served to everyone and the session cannot be known when it
 * renders. Same approach as SiteChrome's nav.
 *
 * Defaults to the SIGNED-OUT state while the session is still unknown, which is
 * the safe direction: a signed-in visitor sees the join bar for a moment and
 * then gets their button, whereas defaulting the other way would flash the very
 * link we are gating to every logged-out visitor.
 *
 * Note this does NOT gate the job content — the description, salary, skills and
 * structured data stay public for signed-out visitors and for crawlers, which
 * see exactly what a logged-out human sees. Only the apply action is gated.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function ApplyGate({
  applyHref,
  applyLabel,
  note,
  jobId,
  compact = false,
}: {
  applyHref: string;
  applyLabel: string;
  note: string;
  jobId: string;
  compact?: boolean;
}) {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session))).catch(() => {});
  }, []);

  if (authed) {
    return (
      <div style={compact ? S.footApply : S.applyRow}>
        <a style={S.applyBtn} href={applyHref} target="_blank" rel="noreferrer">{applyLabel}</a>
        {!compact && <span style={S.applyNote}>{note}</span>}
      </div>
    );
  }

  // The page renders this twice (above and below the description). Signed out,
  // the bar at the top already carries the pitch — repeating it under the
  // description would stack a third ask on top of the "Show my matches" CTA
  // that already sits between them.
  if (compact) return null;

  // Carries the visitor back to this job after login, so the apply they came
  // for is one click away instead of dumping them on the feed.
  const loginHref = `/login?next=${encodeURIComponent(`/job/${jobId}`)}`;

  return (
    <div style={S.gate}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={S.gateTitle}>Apply with your Topezia profile</div>
        <div style={S.gateSub}>
          Free, and takes two minutes — you&apos;ll see your honest match score and the skill gaps for this role before you spend effort on it.
        </div>
      </div>
      <div style={S.gateBtns}>
        <Link href="/onboard" style={S.gatePrimary}>Paste or upload your resume →</Link>
        <Link href={loginHref} style={S.gateSecondary}>Log in</Link>
      </div>
    </div>
  );
}

/**
 * Renders its children only for signed-IN visitors.
 *
 * Used for the "Is this actually worth your time? / Show my matches" card,
 * which for a signed-out visitor repeats the join bar's ask almost word for
 * word, two cards apart. Takes children rather than a render prop so a server
 * component can pass already-rendered markup through.
 */
export function SignedInOnly({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session))).catch(() => {});
  }, []);
  return authed ? <>{children}</> : null;
}

const S: Record<string, CSSProperties> = {
  applyRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 },
  footApply: { marginTop: 26 },
  applyBtn: { display: "inline-block", padding: "13px 24px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: "none" },
  applyNote: { color: MUTED, fontSize: 13 },

  gate: {
    display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
    background: "linear-gradient(135deg,#EEF2FF,#F5F3FF)",
    border: "1px solid #DDD6FE", borderRadius: 16,
    padding: "18px 20px", marginBottom: 20,
  },
  gateTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 17, color: INK, marginBottom: 4 },
  gateSub: { fontSize: 13, color: MUTED, lineHeight: 1.55 },
  // `flex: none` + nowrap buttons sized this row to its content and pushed
  // "Log in" off the right edge of a 375px screen. It has to be allowed to
  // shrink and wrap: the primary grows to fill a narrow row, the secondary
  // keeps its intrinsic width and drops below when there is no space.
  gateBtns: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: "1 1 240px", minWidth: 0 },
  gatePrimary: { display: "inline-block", padding: "12px 20px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 14.5, textDecoration: "none", textAlign: "center", flex: "1 1 auto" },
  gateSecondary: { display: "inline-block", padding: "12px 18px", background: "#fff", color: INDIGO, border: "1px solid #DDD6FE", borderRadius: 12, fontWeight: 700, fontSize: 14.5, textDecoration: "none", textAlign: "center", flex: "0 1 auto", whiteSpace: "nowrap" },
};
