"use client";

/**
 * Career Coach — the full roadmap page. Everything shown is counted from the
 * live postings in the user's field; the thin-market and no-field states say
 * so honestly instead of padding the page.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { SoonTag } from "@/app/_components/ui";
import { RoadmapCard, type Insights } from "@/app/_components/roadmap";

const INK = "#1a1a2e";
const MUTED = "#6b7280";

export default function CoachClient() {
  const [insights, setInsights] = useState<Insights | null | "error">(null);
  const [tier, setTier] = useState<string>("FREE");

  useEffect(() => {
    fetch("/api/profile/insights")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setInsights(d.insights ?? "error"); setTier(d.tier ?? "FREE"); })
      .catch(() => setInsights("error"));
  }, []);

  return (
    <div style={S.page}>
      <div style={S.head}>
        <h1 style={S.h1}>Career Coach</h1>
        <p style={S.sub}>
          {insights && insights !== "error" && insights.reliable
            ? <>Your roadmap, diffed against the {insights.targetJobs} live {insights.fieldLabel ?? "postings"} open to you. Counted, never invented.</>
            : <>Your roadmap, diffed against the live postings in your field. Counted, never invented.</>}
        </p>
      </div>

      {insights === null ? (
        <p style={S.msg}>Scoring you against every live posting in your field…</p>
      ) : insights === "error" ? (
        <p style={S.msg}>We couldn&apos;t load your insights just now — refresh to try again.</p>
      ) : insights.reliable ? (
        <RoadmapCard insights={insights} tier={tier} />
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
        <div style={S.soonHead}>Coming to your coach</div>
        {[
          ["Field momentum", "how fast your field is adding postings, and how long they stay open"],
          ["Insight alerts", "a note when your market moves — a gap crossing a threshold, a skill trending up"],
          ["Shareable career-fit report", "your mirror and roadmap as a page you can send"],
        ].map(([t, d]) => (
          <div key={t} style={S.soonRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.soonTitle}>{t}</div>
              <div style={S.soonMeta}>{d}</div>
            </div>
            <SoonTag />
          </div>
        ))}
      </section>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { maxWidth: 860, margin: "0 auto", padding: "26px 20px 60px" },
  head: { marginBottom: 18 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 24, margin: "0 0 6px", color: INK },
  sub: { fontSize: 13.5, color: MUTED, lineHeight: 1.55, margin: 0, maxWidth: 620 },
  msg: { fontSize: 13.5, color: MUTED, lineHeight: 1.6 },
  thinCard: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 22, fontSize: 13.5, color: MUTED, lineHeight: 1.6 },
  link: { color: "#4f46e5", fontWeight: 600, textDecoration: "none" },
  soonCard: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20 },
  soonHead: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 6 },
  soonRow: { display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: "1px solid #f2f2f5", marginTop: 8 },
  soonTitle: { fontSize: 14, fontWeight: 600, color: INK },
  soonMeta: { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.45 },
};
