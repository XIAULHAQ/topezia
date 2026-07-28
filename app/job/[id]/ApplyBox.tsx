"use client";

/**
 * In-app application form — NATIVE postings only. Crawled jobs keep their
 * honest click-out (ApplyGate); this exists because a native posting's
 * employer runs their pipeline HERE, so the application stays here too.
 *
 * Session is read client-side for the same caching reason as ApplyGate:
 * the job page is one cached document for everyone.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function ApplyBox({ jobId, kind, companyName }: { jobId: string; kind: string; companyName: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [rate, setRate] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "already">("idle");
  const [error, setError] = useState<string | null>(null);
  const isProject = kind === "PROJECT";

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session)).catch(() => {});
  }, []);

  // The tailor-resume panel's "Apply on Topezia" button dispatches this
  // rather than duplicating this form — one source of truth for the native
  // apply flow. ApplyBox starts collapsed, so opening it is what actually
  // reveals the compose form rather than just scrolling to a closed button.
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("topezia:apply-open", open);
    return () => window.removeEventListener("topezia:apply-open", open);
  }, []);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          coverNote: note,
          ...(isProject && rate ? { proposedRate: Number(rate) } : {}),
        }),
      });
      if (res.status === 409) {
        const d = await res.json();
        if (String(d.error ?? "").includes("already")) { setState("already"); return; }
        throw new Error(d.error);
      }
      if (!res.ok) throw new Error((await res.json()).error);
      setState("done");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't send that — try again.");
      setState("idle");
    }
  }

  if (state === "done" || state === "already") {
    return (
      <div style={{ ...S.box, background: "#ECFDF5", borderColor: "#A7F3D0" }}>
        <strong style={{ color: "#047857", fontSize: 14 }}>
          {state === "done" ? (isProject ? "Proposal sent." : "Application sent.") : "You've already applied to this one."}
        </strong>
        <div style={{ fontSize: 12.5, color: "#065F46", marginTop: 4 }}>
          {companyName} sees it in their pipeline — track it under <Link href="/applications" style={{ color: "#047857", fontWeight: 700 }}>My applications</Link>.
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div style={S.box}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{isProject ? "Send a proposal" : "Apply on Topezia"}</div>
        <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 10px" }}>This {isProject ? "project" : "job"} was posted here — {companyName} reviews applications on Topezia.</div>
        <Link href={`/login?next=/job/${jobId}`} style={S.btn}>Sign in to {isProject ? "send a proposal" : "apply"} →</Link>
      </div>
    );
  }

  return (
    <div style={S.box}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{ ...S.btn, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          {isProject ? "Send a proposal →" : "Apply now →"}
        </button>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 }}>{isProject ? `Your proposal to ${companyName}` : `Your application to ${companyName}`}</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isProject ? "What you'd do, and why you're the right person for it…" : "A short note — why you, for this role…"}
            rows={5}
            style={S.ta}
          />
          {isProject && (
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Your bid (USD, whole number — optional)"
              inputMode="numeric"
              style={S.input}
            />
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <button type="button" onClick={submit} disabled={state === "sending"} style={{ ...S.btn, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {state === "sending" ? "Sending…" : "Send"}
            </button>
            <span style={{ fontSize: 11.5, color: MUTED }}>Your Topezia profile goes with it — that&apos;s your resume here.</span>
          </div>
          {error && <div style={{ color: "#b42318", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  box: { border: "1px solid #e5e7eb", background: "#F8FAFC", borderRadius: 14, padding: "16px 18px", margin: "18px 0" },
  btn: { display: "inline-block", background: INDIGO, color: "#fff", borderRadius: 10, padding: "11px 22px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" },
  ta: { width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", resize: "vertical" },
  input: { width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", marginTop: 8 },
};
