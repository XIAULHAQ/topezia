"use client";

/**
 * The AI match breakdown on the job detail page — real, per-viewer.
 *
 * The page is one cached document for everyone (SEO), so this card fetches
 * the member's own match client-side: the SAME cached score their feed shows,
 * or one on-demand rerank on a cache miss. Nothing is invented — the mock's
 * per-dimension bars ("Experience 96%") had no data behind them and are
 * deliberately not rendered, and neither is a specific "before -> after"
 * tailored-score promise (there's no mechanism to score a specific resume
 * draft ahead of actually tailoring it) — the ring, the why-line and the
 * matched/gap skills all come straight from the scorer, and that's it.
 *
 * The "Tailor my resume" CTA dispatches a `topezia:tailor-open` window event
 * rather than owning any tailor state itself — TailorButton.tsx (elsewhere
 * on the page) is the single source of truth for that flow and listens for
 * it, the same decoupled pattern ApplyBox.tsx already uses for its own
 * `topezia:apply-open` event.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/ui";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type Match = { score: number; matchedSkills: string[]; gapSkills: string[]; whyLine: string; provisional: boolean };

export default function MatchCard({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"loading" | "none" | "done" | "error">("loading");
  const [match, setMatch] = useState<Match | null>(null);

  useEffect(() => {
    fetch(`/api/match/${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.match) { setMatch(d.match); setState("done"); }
        else if (d?.none) setState("none");
        else setState("error");
      })
      .catch(() => setState("error"));
  }, [jobId]);

  if (state === "error") return null; // a broken card must never block the job content

  if (state === "none") {
    return (
      <section style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 66, height: 66, borderRadius: "50%", border: `3px dashed #C7D2FE`, display: "grid", placeItems: "center", color: INDIGO, fontWeight: 800, fontSize: 15, flex: "none" }}>?</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={S.h2}>Is this actually worth your time?</h2>
            <p style={S.sub}>Upload your resume once — get an honest match score, and the skill gaps, for this and every other job.</p>
          </div>
          <Link href="/onboard" style={S.cta}>See my match →</Link>
        </div>
      </section>
    );
  }

  if (state === "loading") {
    return (
      <section style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 66, height: 66, borderRadius: "50%", background: "#EEF2FF", flex: "none" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: 180, background: "#EEF2FF", borderRadius: 6 }} />
            <div style={{ height: 11, width: 260, background: "#F1F5F9", borderRadius: 6, marginTop: 9 }} />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 12 }}>Scoring you against this role…</div>
      </section>
    );
  }

  const m = match!;
  const strong = m.score >= 70;
  return (
    <section style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 76, height: 76, flex: "none" }}>
          <svg width="76" height="76" viewBox="0 0 100 100">
            <defs><linearGradient id="jdmc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#3B82F6" /></linearGradient></defs>
            <circle cx="50" cy="50" r="41" stroke="#EEF2FF" strokeWidth="11" fill="none" />
            <circle cx="50" cy="50" r="41" stroke="url(#jdmc)" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="257.6" strokeDashoffset={257.6 * (1 - m.score / 100)} transform="rotate(-90 50 50)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 17, fontWeight: 800, color: INK }}>{m.score}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={S.h2}>{strong ? "Strong match for your profile" : m.score >= 50 ? "Plausible match — with real gaps" : "Honestly, a stretch"}</h2>
          <p style={S.sub}>
            {m.whyLine || (m.provisional ? "Provisional score from profile similarity — the full breakdown comes when our scorer catches up." : "Scored against your profile — the same score your feed shows.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("topezia:tailor-open"))}
          style={S.tailorCta}
        >
          <Icon name="spark" size={14} color="#fff" />Tailor my resume
        </button>
      </div>

      {(m.matchedSkills.length > 0 || m.gapSkills.length > 0) && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {m.matchedSkills.map((s) => (
              <span key={s} style={{ ...S.chip, border: "1px solid #A7F3D0", background: "#ECFDF5", color: "#059669" }}>✓ {s}</span>
            ))}
            {m.gapSkills.map((s) => (
              <span key={s} style={{ ...S.chip, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#B45309" }}>+ {s}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11.5, color: MUTED, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#059669" }} />You have this</span>
            {m.gapSkills.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#F59E0B" }} />Gap to close</span>}
            {m.gapSkills.length > 0 && (
              <Link href="/coach" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: INDIGO, textDecoration: "none" }}>Close the gaps with your Career Coach →</Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 24px", margin: "18px 0" },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, color: INK },
  sub: { margin: "6px 0 0", fontSize: 12.5, color: "#334155", lineHeight: 1.6 },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600 },
  cta: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 13, fontWeight: 700, textDecoration: "none", flex: "none" },
  tailorCta: { flex: "none", display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
