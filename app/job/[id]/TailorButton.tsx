"use client";

/**
 * "Tailor my resume for this job" — sits next to the apply block on every
 * job page (native or external; tailoring is independent of how the
 * application itself happens). Opens TailorPanel.tsx as a slide-in drawer
 * over the job page, no navigation away. Also listens for a
 * `topezia:tailor-open` window event, mirroring ApplyBox.tsx's
 * `topezia:apply-open` — MatchCard.tsx's own "Tailor my resume" CTA lives in
 * a different part of the page and has no direct handle on this component,
 * so it dispatches the event instead of duplicating this button's state.
 *
 * On mount (signed-in), checks whether a tailored version already exists for
 * this job (GET /api/resume?jobId=) — starts in a `checking` state that
 * disables the button until it resolves, so a fast click can't fall through
 * to the "generate" path and spend a real AI call on a job that's already
 * tailored. Once resolved: "ready" (a version exists — button reads Download,
 * click reopens the panel with that content, no new AI call) or "none"
 * (button reads Tailor, click generates one). Premium-gated server-side
 * (POST /api/resume/tailor returns 402) rather than pre-checked here.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ResumeContent } from "@/lib/resume/doc";
import TailorPanel from "./TailorPanel";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Status = "checking" | "none" | "ready";
type Assets = { content: ResumeContent; photo: string | null; publicUrl: string | null; qr: string | null };

export default function TailorButton({
  jobId, companyName, jobTitle, jobSkills, applyHref, applyLabel, isNative,
}: {
  jobId: string;
  companyName: string;
  jobTitle: string;
  jobSkills: string[];
  applyHref: string;
  applyLabel: string;
  isNative: boolean;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [tailored, setTailored] = useState<Assets | null>(null);
  const [main, setMain] = useState<ResumeContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      const has = !!data.session;
      setSignedIn(has);
      if (!has) { setStatus("none"); return; }
      fetch(`/api/resume?jobId=${encodeURIComponent(jobId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.content) { setTailored({ content: d.content, photo: d.photo ?? null, publicUrl: d.publicUrl ?? null, qr: d.qr ?? null }); setStatus("ready"); }
          else setStatus("none");
        })
        .catch(() => setStatus("none"));
    }).catch(() => setStatus("none"));
  }, [jobId]);

  /** Generates (or regenerates) the tailored version and the main resume it's
   *  diffed against, in parallel — independent requests, no reason to stack
   *  their latency. */
  async function generate() {
    setBusy(true); setError(null); setUpgrade(false);
    try {
      const [tailorRes, mainRes] = await Promise.all([
        fetch("/api/resume/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) }),
        fetch("/api/resume"),
      ]);
      if (tailorRes.status === 402) { setUpgrade(true); return; }
      const tailorData = await tailorRes.json().catch(() => ({}));
      if (!tailorRes.ok) throw new Error(tailorData.error);
      const mainData = await mainRes.json().catch(() => ({}));
      setMain(mainData.content ?? null);
      setTailored({ content: tailorData.content, photo: mainData.photo ?? null, publicUrl: mainData.publicUrl ?? null, qr: mainData.qr ?? null });
      setStatus("ready");
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't tailor that resume — try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Reopen with an already-generated tailored version — no new AI call,
   *  only the (free) main-resume fetch if it isn't already cached. */
  async function openExisting() {
    setBusy(true); setError(null);
    try {
      if (!main) {
        const r = await fetch("/api/resume");
        const d = await r.json().catch(() => ({}));
        setMain(d.content ?? null);
      }
      setOpen(true);
    } catch {
      setError("Couldn't load your resume — try again.");
    } finally {
      setBusy(false);
    }
  }

  // MatchCard's "Tailor my resume" CTA has no direct reference to this
  // component's state — it just dispatches this event, same shape as
  // ApplyBox's topezia:apply-open. Not-signed-in sends the person to the
  // same login link the gated button below offers, rather than silently
  // calling generate()/openExisting() against a component that (for a
  // signed-out visitor) never even renders the panel's mount point.
  useEffect(() => {
    const onOpen = () => {
      if (status === "checking" || busy) return;
      if (!signedIn) { window.location.href = `/login?next=/job/${jobId}`; return; }
      if (status === "ready") openExisting(); else generate();
    };
    window.addEventListener("topezia:tailor-open", onOpen);
    return () => window.removeEventListener("topezia:tailor-open", onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, busy, main, signedIn, jobId]);

  // Signed out this used to be a THIRD sign-in prompt in the same rail, beside
  // the readiness checklist and the apply box — three buttons that all did the
  // same thing, in front of someone who came here to apply. Tailoring is a
  // thing you do once you have an account, so it simply isn't offered until
  // there is one; ApplyBox carries the single call to action.
  if (!signedIn) return null;

  if (upgrade) {
    return (
      <div style={S.box}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Tailor your resume for this job</div>
        <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 10px" }}>Tailoring a resume to a specific posting is a Premium feature.</div>
        <Link href="/pricing" style={S.ghostBtn}>See Premium →</Link>
      </div>
    );
  }

  const label = status === "checking" ? "Tailor my resume for this job →"
    : status === "ready" ? (busy ? "Loading…" : "Download tailored resume →")
    : (busy ? "Tailoring…" : "Tailor my resume for this job →");

  return (
    <div style={S.box}>
      <button
        type="button"
        onClick={status === "ready" ? openExisting : generate}
        disabled={status === "checking" || busy}
        style={{ ...S.ghostBtn, border: "none", cursor: "pointer", fontFamily: "inherit", opacity: status === "checking" || busy ? 0.7 : 1 }}
      >
        {label}
      </button>
      {error && <div style={{ color: "#b42318", fontSize: 12.5, marginTop: 8 }}>{error}</div>}

      {open && tailored && main && (
        <TailorPanel
          main={main}
          tailored={tailored.content}
          job={{ id: jobId, title: jobTitle, company: companyName }}
          jobSkills={jobSkills}
          applyHref={applyHref}
          applyLabel={applyLabel}
          isNative={isNative}
          photo={tailored.photo}
          publicUrl={tailored.publicUrl}
          qr={tailored.qr}
          regenerating={busy}
          onRegenerate={generate}
          onSaved={(content) => setTailored((cur) => (cur ? { ...cur, content } : cur))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  box: { border: "1px solid #e5e7eb", background: "#F8FAFC", borderRadius: 14, padding: "16px 18px" },
  ghostBtn: { display: "inline-block", background: "#fff", color: INDIGO, border: `1.5px solid ${INDIGO}`, borderRadius: 10, padding: "10.5px 22px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" },
};
