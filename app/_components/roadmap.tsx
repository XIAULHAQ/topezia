"use client";

/**
 * The roadmap — every number counted from real postings, never invented.
 *
 * RoadmapCard is the full thing (gaps, learn-this-next, ladder, certs) and
 * lives on /coach. RoadmapTeaser is the two-row hook shown beside profile
 * editing — enough to see the diagnosis, with the full card one click away.
 * Both render the same /api/profile/insights payload; the types here mirror
 * ProfileInsights in lib/matching/insights.ts.
 */
import Link from "next/link";
import type { CSSProperties } from "react";

const INK = "#1a1a2e";
const MUTED = "#6b7280";

export interface SkillGap { skill: string; jobsWanting: number; pct: number; youHave: string | null }
export interface NextSkill { skill: string; withSkill: string; pairJobs: number; pairPct: number }
export interface LadderStep { skill: string; nextPct: number; yourPct: number; jobs: number }
export interface Insights {
  fieldLabel: string | null;
  targetJobs: number;
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null;
  skillGaps: SkillGap[];
  nextSkills: NextSkill[];
  ladder: { from: string; to: string; atLevelJobs: number; nextLevelJobs: number; steps: LadderStep[] } | null;
  certs: { label: string; jobs: number }[];
  premiumFrom: number;
  inferred: boolean;
  reliable: boolean;
}

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

// A to-scale demand meter. The number always rides beside the bar — the bar is
// the shape, the label is the fact, so nothing reads by color alone.
export function Meter({ pct, color = "#8B5CF6" }: { pct: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "1 1 220px", minWidth: 160 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#f1f1f6" }}>
        <div style={{ width: pct === 0 ? 0 : `${Math.max(2, Math.min(100, pct))}%`, height: "100%", borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
    </div>
  );
}

function GapRow({ g, tag }: { g: SkillGap; tag: React.ReactNode }) {
  return (
    <div style={R.gapRow}>
      <div style={R.rowTop}>
        <div style={R.rowTitle}>{g.youHave ? `Take ${g.skill} from ${g.youHave.toLowerCase()} to advanced` : `Add ${g.skill}`}</div>
        {tag}
      </div>
      <div style={R.meterRow}>
        <Meter pct={g.pct} />
        <span style={R.meterNote}>{g.youHave ? `you're ${g.youHave.toLowerCase()} today` : "not on your profile yet"}</span>
      </div>
    </div>
  );
}

function PairRow({ n, tag }: { n: NextSkill; tag: React.ReactNode }) {
  return (
    <div style={R.gapRow}>
      <div style={R.rowTop}>
        <div style={{ ...R.rowTitle, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={R.chipHave}>you have · {n.withSkill}</span>
          <span aria-hidden="true" style={{ color: MUTED }}>→</span>
          <span style={R.chipNext}>{n.skill}</span>
        </div>
        {tag}
      </div>
      <div style={R.meterRow}>
        <Meter pct={n.pairPct} />
        <span style={R.meterNote}>{n.pairJobs} postings name both</span>
      </div>
    </div>
  );
}

export function RoadmapCard({ insights, tier }: { insights: Insights; tier: string }) {
  return (
    <section style={R.card}>
      <div style={R.cardLabel}>Your roadmap · what these jobs ask that you don&apos;t have yet</div>
      <div style={R.diagnosis}>
        Biggest lever: <strong>{insights.skillGaps[0].skill}</strong> — named in {insights.skillGaps[0].pct}% of {insights.fieldLabel ?? "these roles"}.
      </div>
      <div style={R.secSub}>Each bar is the share of the {insights.targetJobs} postings in your field that name it.</div>
      {insights.skillGaps.map((g, i) => (
        <GapRow key={g.skill} g={g} tag={
          i === 0 ? <span style={R.freeTag}>biggest gap</span>
          : i >= insights.premiumFrom && tier !== "PREMIUM" ? <span style={R.premTag}>premium</span> : null
        } />
      ))}
      {/* Learn-this-next: gaps ranked by the pull of skills you already have */}
      {insights.nextSkills.length > 0 && (
        <div style={R.sec}>
          <div style={R.secHead}><span style={R.secDot} />Learn this next · what rides along with skills you have</div>
          <div style={R.secSub}>Of the postings asking for a skill you already have, the share that also name the next one.</div>
          {insights.nextSkills.map((n, i) => (
            <PairRow key={n.skill} n={n} tag={
              i === 0 ? <span style={R.freeTag}>strongest pull</span>
              : tier !== "PREMIUM" ? <span style={R.premTag}>premium</span> : null
            } />
          ))}
        </div>
      )}
      {/* Ladder: the counted diff between your level's postings and the next level's */}
      {insights.ladder && (
        <div style={R.sec}>
          <div style={R.secHead}><span style={R.secDot} />The jump to {label(insights.ladder.to)} · what the next level&apos;s postings add</div>
          <div style={R.secSub}>
            How often the {insights.ladder.nextLevelJobs} {label(insights.ladder.to).toLowerCase()} postings in your field name it, against the {insights.ladder.atLevelJobs} at your level.
          </div>
          {insights.ladder.steps.map((s, i) => (
            <div key={s.skill} style={R.gapRow}>
              <div style={R.rowTop}>
                <div style={R.rowTitle}>{s.skill}</div>
                {i === 0 ? <span style={R.freeTag}>next-level diff</span>
                : tier !== "PREMIUM" ? <span style={R.premTag}>premium</span> : null}
              </div>
              <div style={R.lvlRow}><span style={R.lvlLabel}>{label(insights.ladder!.to).toLowerCase()}</span><Meter pct={s.nextPct} /></div>
              <div style={R.lvlRow}><span style={R.lvlLabel}>you</span><Meter pct={s.yourPct} color="#c9cbd6" /></div>
            </div>
          ))}
        </div>
      )}
      {insights.certs.length > 0 && (
        <div style={R.sec}>
          <div style={R.secHead}><span style={R.secDot} />Certifications your field names</div>
          <div style={R.gapRow}>
            <div style={R.rowTop}>
              <div style={R.rowTitle}>{insights.certs[0].label}</div>
              {tier !== "PREMIUM" && <span style={R.premTag}>premium</span>}
            </div>
            <div style={R.rowMeta}>named in {insights.certs[0].jobs} of your field&apos;s postings</div>
          </div>
        </div>
      )}
      <div style={R.foot}>Every step is counted from real postings, never invented. Free while we&apos;re new — the tag shows where premium will fall later.</div>
    </section>
  );
}

// The two-row hook beside profile editing: the diagnosis and the strongest
// pull, with the full roadmap one click away in Career Coach.
export function RoadmapTeaser({ insights }: { insights: Insights }) {
  const gap = insights.skillGaps[0];
  const next = insights.nextSkills[0];
  return (
    <section style={R.card}>
      <div style={R.cardLabel}>Your roadmap · counted from your field&apos;s postings</div>
      <div style={R.diagnosis}>
        Biggest lever: <strong>{gap.skill}</strong> — named in {gap.pct}% of {insights.fieldLabel ?? "these roles"}.
      </div>
      <GapRow g={gap} tag={<span style={R.freeTag}>biggest gap</span>} />
      {next && <PairRow n={next} tag={<span style={R.freeTag}>strongest pull</span>} />}
      <div style={{ ...R.foot, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 200 }}>Every step is counted from real postings, never invented.</span>
        <Link href="/coach" style={R.coachLink}>See your full roadmap in Career Coach →</Link>
      </div>
    </section>
  );
}

const R: Record<string, CSSProperties> = {
  card: { background: "#fff", border: "1px solid #ececf2", borderTop: "3px solid #8B5CF6", borderRadius: 16, padding: 20, marginBottom: 22 },
  cardLabel: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 12 },
  diagnosis: { background: "#eef0ff", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#3a34a8", lineHeight: 1.5, marginBottom: 14 },
  // One violet accent for every demand meter, chips for the pairing lens, gray
  // only as the labeled "your level" reference bar.
  sec: { marginTop: 22 },
  secHead: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED },
  secDot: { width: 7, height: 7, borderRadius: "50%", background: "#8B5CF6", flexShrink: 0 },
  secSub: { fontSize: 12, color: MUTED, lineHeight: 1.45, margin: "4px 0 2px" },
  gapRow: { padding: "13px 0 12px", borderTop: "1px solid #f2f2f5", marginTop: 10 },
  rowTop: { display: "flex", alignItems: "center", gap: 10 },
  rowTitle: { fontSize: 14, fontWeight: 600, color: INK, flex: 1, minWidth: 0 },
  rowMeta: { fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.45 },
  meterRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  meterNote: { fontSize: 12, color: MUTED, whiteSpace: "nowrap" },
  chipHave: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "#e7f6ee", color: "#0f6e56", whiteSpace: "nowrap" },
  chipNext: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "#eef0ff", color: "#3a34a8", whiteSpace: "nowrap" },
  lvlRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 7 },
  lvlLabel: { fontSize: 11, fontWeight: 700, color: MUTED, width: 46, flexShrink: 0, letterSpacing: 0.3 },
  freeTag: { fontSize: 11, color: MUTED, whiteSpace: "nowrap" },
  premTag: { fontSize: 11, padding: "2px 9px", borderRadius: 12, background: "#f0eaff", color: "#7a3cff", whiteSpace: "nowrap" },
  foot: { fontSize: 12, color: MUTED, borderTop: "1px solid #f2f2f5", marginTop: 16, paddingTop: 12, lineHeight: 1.45 },
  coachLink: { fontSize: 12.5, fontWeight: 700, color: "#4f46e5", textDecoration: "none", whiteSpace: "nowrap" },
};
