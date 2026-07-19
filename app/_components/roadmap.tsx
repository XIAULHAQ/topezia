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
import { C, Icon } from "./ui";

const INK = "#1a1a2e";
const MUTED = "#6b7280";

export interface SkillGap { skill: string; jobsWanting: number; pct: number; youHave: string | null }
export interface NextSkill { skill: string; withSkill: string; pairJobs: number; pairPct: number }
export interface LadderStep { skill: string; nextPct: number; yourPct: number; jobs: number }
export interface Momentum {
  fresh7: number;
  fresh30: number;
  dated: number;
  medianAgeDays: number;
  corpusMedianAgeDays: number | null;
  ageMix: { under1w: number; w1to4: number; over4w: number };
  weeklyAdded: { weekStart: string; n: number }[] | null;
  medianLifetimeDays: number | null;
}
export interface Insights {
  fieldLabel: string | null;
  targetJobs: number;
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null;
  skillGaps: SkillGap[];
  nextSkills: NextSkill[];
  momentum: Momentum | null;
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

// ---- Coach page pieces (redesigned per the Career Coach design mock) ------

// Gradient demand bar: #EEF2FF track, rounded gradient fill. The percentage
// label always renders beside it — the bar is the shape, the label is the fact.
function GradBar({ pct, grad, h = 6 }: { pct: number; grad: string; h?: number }) {
  return (
    <div style={{ height: h, background: "#EEF2FF", borderRadius: 999, overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", borderRadius: 999, background: grad, width: pct === 0 ? 0 : `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <span style={{ background: bg, color, fontSize: 9.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flex: "none" }}>{text}</span>;
}
const PREM = { bg: "#F5F3FF", color: "#7C3AED" };

// One roadmap grid card: 4px gradient cap, icon chip, title, sub, content.
function CoachCard({ grad, icon, title, sub, children }: { grad: string; icon: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ height: 4, background: grad }} />
      <div style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: grad, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Icon name={icon} size={14} /></span>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{title}</h3>
        </div>
        <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.5, marginBottom: 16 }}>{sub}</div>
        {children}
      </div>
    </section>
  );
}

// Section header row: icon chip + title + muted note.
export function CoachSectionHead({ icon, title, note }: { icon: string; title: string; note: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px" }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: "#EEF2FF", color: C.c1, display: "grid", placeItems: "center", flex: "none" }}><Icon name={icon} size={16} /></span>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>{title}</h2>
      <span style={{ fontSize: 12, color: C.mut }}>{note}</span>
    </div>
  );
}

const BANNER: CSSProperties = { background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 12, padding: "12px 18px", fontSize: 13, color: "#3730A3", marginBottom: 16, lineHeight: 1.5 };
const GRAD2 = "linear-gradient(90deg,#3B82F6,#22D3EE)"; // learn-this-next accent
const GRAD3 = "linear-gradient(90deg,#0F172A,#6366F1)"; // ladder accent

// The full roadmap for /coach: header, diagnosis banner, then a responsive
// grid of cards — gaps, learn-this-next, the ladder, and (when the field
// actually names any) certifications.
export function RoadmapCard({ insights, tier }: { insights: Insights; tier: string }) {
  const grad1 = `linear-gradient(90deg,${C.c1},${C.c2})`;
  return (
    <div>
      <CoachSectionHead icon="map" title="Your roadmap" note="what these jobs ask that you don't have yet" />
      <div style={BANNER}>
        Biggest lever: <strong>{insights.skillGaps[0].skill}</strong> — named in {insights.skillGaps[0].pct}% of {insights.fieldLabel ?? "these roles"}.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18, alignItems: "start" }}>
        <CoachCard grad={grad1} icon="plus" title="Add these skills" sub={`Share of the ${insights.targetJobs} postings in your field that name it.`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {insights.skillGaps.map((g, i) => (
              <div key={g.skill}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0 }}>{g.youHave ? `Level up ${g.skill}` : `Add ${g.skill}`}</span>
                  {i === 0 ? <Pill text="biggest gap" bg="#FEF3C7" color="#B45309" />
                    : i >= insights.premiumFrom && tier !== "PREMIUM" ? <Pill text="premium" {...PREM} /> : null}
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.c1 }}>{g.pct}%</span>
                </div>
                <GradBar pct={g.pct} grad={grad1} />
                <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4 }}>{g.youHave ? `you're ${g.youHave.toLowerCase()} today` : "not on your profile yet"}</div>
              </div>
            ))}
          </div>
        </CoachCard>

        {insights.nextSkills.length > 0 && (
          <CoachCard grad={GRAD2} icon="link" title="Learn this next" sub="Of the postings asking for a skill you already have, the share that also name the next one.">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {insights.nextSkills.map((n, i) => (
                <div key={n.skill}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                    <span style={{ background: "#ECFDF5", color: "#059669", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px" }}>you have · {n.withSkill}</span>
                    <span aria-hidden="true" style={{ color: C.mut, fontSize: 11 }}>→</span>
                    <span style={{ background: "#EEF2FF", color: "#4F46E5", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px" }}>{n.skill}</span>
                    <span style={{ flex: 1 }} />
                    {i === 0 ? <Pill text="strongest pull" bg="#ECFDF5" color="#059669" />
                      : tier !== "PREMIUM" ? <Pill text="premium" {...PREM} /> : null}
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.c1 }}>{n.pairPct}%</span>
                  </div>
                  <GradBar pct={n.pairPct} grad={GRAD2} />
                  <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4 }}>{n.pairJobs} postings name both</div>
                </div>
              ))}
            </div>
          </CoachCard>
        )}

        {insights.ladder && (
          <CoachCard grad={GRAD3} icon="trend" title={`The jump to ${label(insights.ladder.to)}`}
            sub={`How often the ${insights.ladder.nextLevelJobs} ${label(insights.ladder.to).toLowerCase()} postings in your field name it, against the ${insights.ladder.atLevelJobs} at your level.`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {insights.ladder.steps.map((s, i) => (
                <div key={s.skill}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0 }}>{s.skill}</span>
                    {i === 0 ? <Pill text="next-level diff" {...PREM} />
                      : tier !== "PREMIUM" ? <Pill text="premium" {...PREM} /> : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, color: C.mut, width: 30, flex: "none" }}>{label(insights.ladder!.to).toLowerCase()}</span>
                    <GradBar pct={s.nextPct} grad={grad1} />
                    <span style={{ fontSize: 11.5, fontWeight: 800, width: 34, textAlign: "right" }}>{s.nextPct}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ fontSize: 10.5, color: C.mut, width: 30, flex: "none" }}>you</span>
                    <div style={{ height: 6, background: "#EEF2FF", borderRadius: 999, overflow: "hidden", flex: 1 }}>
                      <div style={{ height: "100%", borderRadius: 999, background: "#CBD5E1", width: s.yourPct === 0 ? 0 : `${Math.max(2, Math.min(100, s.yourPct))}%` }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, width: 34, textAlign: "right", color: C.mut }}>{s.yourPct}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, borderTop: "1px solid #F1F5F9", paddingTop: 12, fontSize: 10.5, color: C.mut, lineHeight: 1.55 }}>
              Every step is counted from real postings, never invented. Free while we&#39;re new — the tag shows where premium will fall later.
            </div>
          </CoachCard>
        )}

        {insights.certs.length > 0 && (
          <CoachCard grad={grad1} icon="award" title="Certifications your field names" sub={`Counted across the ${insights.targetJobs} postings in your field.`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {insights.certs.map((c) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0 }}>{c.label}</span>
                  {tier !== "PREMIUM" && <Pill text="premium" {...PREM} />}
                  <span style={{ fontSize: 11.5, color: C.mut }}>{c.jobs} postings</span>
                </div>
              ))}
            </div>
          </CoachCard>
        )}
      </div>
    </div>
  );
}

// Field momentum — how fresh the market's live inventory is, from the dates
// the postings themselves declare. The growth trend and posting-lifetime tiles
// stay visibly locked until our own tracking has enough history to count them
// (the engine returns null until then) — shown as locked, never estimated.
export function MomentumCard({ momentum, fieldLabel }: { momentum: Momentum; fieldLabel: string | null }) {
  const grad1 = `linear-gradient(90deg,${C.c1},${C.c2})`;
  const pct = (n: number) => Math.round((n / momentum.dated) * 100);
  const peak = momentum.weeklyAdded ? Math.max(...momentum.weeklyAdded.map((w) => w.n), 1) : 1;
  const tile: CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 12, padding: "15px 17px" };
  return (
    <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "24px 26px", marginTop: 22 }}>
      <CoachSectionHead icon="pulse" title="Field momentum" note="how fresh your market is" />
      <div style={{ ...BANNER, marginBottom: 18 }}>
        <strong>{momentum.fresh7}</strong> of the {momentum.dated} dated postings in {fieldLabel ?? "your field"} went up in the last 7 days; <strong>{momentum.fresh30}</strong> in the last 30.
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 12 }}>Each bar is the share of the {momentum.dated} dated live postings in your field, by posting date.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {([
          ["posted this week", momentum.ageMix.under1w],
          ["1–4 weeks up", momentum.ageMix.w1to4],
          ["over 4 weeks up", momentum.ageMix.over4w],
        ] as const).map(([lbl, n]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, width: 104, flex: "none" }}>{lbl}</span>
            <GradBar pct={pct(n)} grad={grad1} h={8} />
            <span style={{ fontSize: 12.5, fontWeight: 800, width: 40, textAlign: "right", flex: "none" }}>{pct(n)}%</span>
            <span style={{ fontSize: 11.5, color: C.mut, width: 78, flex: "none" }}>{n} postings</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, marginTop: 20 }}>
        <div style={tile}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Median posting age: {momentum.medianAgeDays} days</div>
          {momentum.corpusMedianAgeDays !== null && (
            <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4, lineHeight: 1.5 }}>across every field on Topezia it&#39;s {momentum.corpusMedianAgeDays} days</div>
          )}
        </div>
        <div style={tile}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>Postings added per week</div>
            {!momentum.weeklyAdded && <Pill text="counting" bg="#F1F5F9" color="#64748B" />}
          </div>
          {momentum.weeklyAdded ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 10 }}>
              {momentum.weeklyAdded.map((w) => (
                <div key={w.weekStart} style={{ flex: 1, maxWidth: 90 }}>
                  <div style={{ height: 42, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", borderRadius: 4, background: grad1, height: `${Math.max(6, (w.n / peak) * 100)}%` }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4 }}>{w.n} · wk of {w.weekStart.slice(5)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4, lineHeight: 1.5 }}>unlocks once we&#39;ve watched your market for 3 weeks — we won&#39;t read our own first crawl as a hiring spike</div>
          )}
        </div>
        <div style={tile}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>
              {momentum.medianLifetimeDays !== null ? `Postings stay open a median ${momentum.medianLifetimeDays} days` : "How long postings stay open"}
            </div>
            {momentum.medianLifetimeDays === null && <Pill text="counting" bg="#F1F5F9" color="#64748B" />}
          </div>
          {momentum.medianLifetimeDays === null && (
            <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4, lineHeight: 1.5 }}>unlocks after we&#39;ve seen 20 of your field&#39;s postings actually close — counted from real expirations, not guessed</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.mut, marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F5F9", lineHeight: 1.55 }}>
        Posting dates come from the postings themselves. The locked rows light up when our own tracking can count them honestly.
      </div>
    </section>
  );
}

// ---- Profile-edit teaser (kept in the profile page's own visual language) --

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
  gapRow: { padding: "13px 0 12px", borderTop: "1px solid #f2f2f5", marginTop: 10 },
  rowTop: { display: "flex", alignItems: "center", gap: 10 },
  rowTitle: { fontSize: 14, fontWeight: 600, color: INK, flex: 1, minWidth: 0 },
  meterRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  meterNote: { fontSize: 12, color: MUTED, whiteSpace: "nowrap" },
  chipHave: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "#e7f6ee", color: "#0f6e56", whiteSpace: "nowrap" },
  chipNext: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "#eef0ff", color: "#3a34a8", whiteSpace: "nowrap" },
  freeTag: { fontSize: 11, color: MUTED, whiteSpace: "nowrap" },
  foot: { fontSize: 12, color: MUTED, borderTop: "1px solid #f2f2f5", marginTop: 16, paddingTop: 12, lineHeight: 1.45 },
  coachLink: { fontSize: 12.5, fontWeight: 700, color: "#4f46e5", textDecoration: "none", whiteSpace: "nowrap" },
};
