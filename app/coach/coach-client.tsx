"use client";

/**
 * Career Coach — the full roadmap page, per the coach redesign: dark hero
 * band, roadmap card grid, field momentum, and a dark "coming to your coach"
 * strip. Everything shown is counted from the live postings in the user's
 * field; the thin-market and no-field states say so honestly instead of
 * padding the page.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, FONT, GRAD, Icon } from "@/app/_components/ui";
import { MomentumCard, RoadmapCard, type Insights } from "@/app/_components/roadmap";

export default function CoachClient() {
  const [insights, setInsights] = useState<Insights | null | "error">(null);
  const [tier, setTier] = useState<string>("FREE");

  useEffect(() => {
    fetch("/api/profile/insights")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setInsights(d.insights ?? "error"); setTier(d.tier ?? "FREE"); })
      .catch(() => setInsights("error"));
  }, []);

  const ok = insights !== null && insights !== "error";
  return (
    <div style={S.page}>
      {/* Dark hero band */}
      <section style={S.hero}>
        <div style={S.heroGlow} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={S.heroIcon}><Icon name="spark" size={20} color="#fff" /></span>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={S.h1}>Career Coach</h1>
            <div style={S.heroSub}>
              {ok && insights.reliable
                ? <>Your roadmap, diffed against the <strong style={{ color: "#fff" }}>{insights.targetJobs} live {insights.fieldLabel ?? "postings"}</strong> open to you. Counted, never invented.</>
                : <>Your roadmap, diffed against the live postings in your field. Counted, never invented.</>}
            </div>
          </div>
        </div>
      </section>

      {insights === null ? (
        <p style={S.msg}>Scoring you against every live posting in your field…</p>
      ) : insights === "error" ? (
        <p style={S.msg}>We couldn&apos;t load your insights just now — refresh to try again.</p>
      ) : insights.reliable ? (
        <>
          <RoadmapCard insights={insights} tier={tier} />
          {insights.momentum && <MomentumCard momentum={insights.momentum} fieldLabel={insights.fieldLabel} />}
        </>
      ) : (
        <section style={S.thinCard}>
          {insights.fieldLabel ? (
            <>Your market is still thin — only {insights.targetJobs} {insights.fieldLabel.replace(/ roles( \(broad\))?$/, "")} {insights.targetJobs === 1 ? "role is" : "roles are"} open to your region, too few for an honest roadmap yet. It sharpens as we add sources in your market.</>
          ) : (
            <>Set your role on <Link href="/profile/edit" style={S.link}>your profile</Link> and we&apos;ll scope your roadmap to the right field.</>
          )}
        </section>
      )}

      {/* What's coming — named honestly, not pretended. */}
      <section style={S.soonCard}>
        <div style={S.soonGlow} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Icon name="spark" size={20} color="#fff" />
          <h2 style={S.soonHead}>Coming to your coach</h2>
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          {[
            ["Insight alerts", "a note when your market moves — a gap crossing a threshold, a skill trending up"],
            ["Shareable career-fit report", "your mirror and roadmap as a page you can send"],
          ].map(([t, d]) => (
            <div key={t} style={S.soonTile}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{t}</div>
                <span style={S.soonPill}>Soon</span>
              </div>
              <div style={S.soonMeta}>{d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { maxWidth: 1060, margin: "0 auto", padding: "20px 20px 40px", fontFamily: FONT, color: C.ink },
  hero: { background: C.navy, borderRadius: 18, padding: "26px 30px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 22 },
  heroGlow: { position: "absolute", top: -100, right: -40, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.36), transparent 68%)" },
  heroIcon: { width: 44, height: 44, borderRadius: 12, background: GRAD, display: "grid", placeItems: "center", flex: "none", position: "relative" },
  h1: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 },
  heroSub: { fontSize: 12.5, color: "#94A3C0", marginTop: 5, lineHeight: 1.55 },
  msg: { fontSize: 13.5, color: C.mut, lineHeight: 1.6 },
  thinCard: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, fontSize: 13.5, color: C.mut, lineHeight: 1.6 },
  link: { color: C.c1, fontWeight: 600, textDecoration: "none" },
  soonCard: { background: `linear-gradient(160deg, ${C.navy}, ${C.navy2})`, borderRadius: 16, padding: "24px 26px", marginTop: 22, color: "#fff", position: "relative", overflow: "hidden" },
  soonGlow: { position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)" },
  soonHead: { margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: -0.3 },
  soonTile: { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 12, padding: "16px 18px" },
  soonPill: { background: "rgba(99,102,241,.25)", border: "1px solid rgba(139,92,246,.4)", color: "#C4B5FD", fontSize: 9.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px", flex: "none", whiteSpace: "nowrap" },
  soonMeta: { fontSize: 12, color: "#B9C0D4", marginTop: 5, lineHeight: 1.55 },
};
