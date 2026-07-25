/**
 * The feed's "AI coach tip" pool — rotating, counted, never invented.
 *
 * The card used to show the same top skill-pairing on every visit; by the
 * third load it was wallpaper. This builds a POOL of tips from data the feed
 * already has — snapshot-diff news, Career Score moves, skill pairings, gaps,
 * the promotion ladder, certs, posting freshness — and rotates one per day
 * (deterministic, so reloads don't shuffle), with a manual "another tip"
 * offset on top. Every tip is a templated counted fact; the honest-AI part is
 * the embedding matcher that scopes the field, same as the Career Score.
 *
 * Pure module: no React, no prisma — the feed client imports it directly.
 */

export interface TipPart {
  text: string;
  /** Render emphasis: strong = white/bold (the subject), accent = green (the number). */
  strong?: boolean;
  accent?: boolean;
}

export interface CoachTip {
  parts: TipPart[];
  href: string;
  cta: string;
}

export interface TipInsights {
  reliable: boolean;
  nextSkills: { skill: string; withSkill: string; pairPct: number }[];
  skillGaps: { skill: string; pct: number }[];
  ladder: { to: string; steps: { skill: string; nextPct: number; yourPct: number }[] } | null;
  certs: { label: string; jobs: number }[];
  momentum: { fresh7: number } | null;
}

export interface TipChange {
  headline: string;
  detail: string | null;
}

export interface TipScore {
  score: number | null;
  moves: { label: string; href: string }[];
}

const CTA: Record<string, string> = {
  "/resume": "Open the Resume Builder →",
  "/coach": "Open your career coach →",
  "/portfolio/new": "Add a piece of work →",
  "/profile": "Open your profile →",
};
const cta = (href: string) => CTA[href] ?? "Open your career coach →";

const lc = (s: string) => s.replace(/_/g, " ").toLowerCase();

export function buildTips(
  insights: TipInsights | null,
  changes: TipChange[] | null,
  score: TipScore | null
): CoachTip[] {
  // Each lens contributes in a deliberate interleaving — consecutive days get
  // different KINDS of tip, not the #1 and #2 of the same list.
  const news: CoachTip[] = [];
  const moves: CoachTip[] = [];
  const pairs: CoachTip[] = [];
  const gaps: CoachTip[] = [];
  const rest: CoachTip[] = [];

  // "What moved" — the diff headline is already one counted sentence.
  for (const c of (changes ?? []).slice(0, 2)) {
    news.push({
      parts: [{ text: c.headline, strong: true }, ...(c.detail ? [{ text: ` ${c.detail}` }] : [])],
      href: "/coach",
      cta: "See what moved →",
    });
  }

  // Career Score moves — the same "what would raise it" items the profile
  // shows, so the feed and the score tell one story.
  if (score?.score != null) {
    for (const m of score.moves.slice(0, 2)) {
      moves.push({
        parts: [
          { text: "Your Career Score is " },
          { text: String(score.score), accent: true },
          { text: " — the biggest lift: " },
          { text: m.label, strong: true },
        ],
        href: m.href,
        cta: cta(m.href),
      });
    }
  }

  if (insights?.reliable) {
    for (const n of insights.nextSkills.slice(0, 2)) {
      pairs.push({
        parts: [
          { text: n.skill, strong: true },
          { text: ` rides along with your ${n.withSkill} — ` },
          { text: `${n.pairPct}%`, accent: true },
          { text: ` of postings wanting ${n.withSkill} also name it.` },
        ],
        href: "/coach",
        cta: cta("/coach"),
      });
    }
    for (const g of insights.skillGaps.slice(0, 2)) {
      gaps.push({
        parts: [
          { text: "Learning " },
          { text: g.skill, strong: true },
          { text: " would line you up with the " },
          { text: `${g.pct}%`, accent: true },
          { text: " of roles in your field that ask for it." },
        ],
        href: "/coach",
        cta: cta("/coach"),
      });
    }
    const step = insights.ladder?.steps[0];
    if (insights.ladder && step) {
      rest.push({
        parts: [
          { text: step.skill, strong: true },
          { text: ` shows up in ` },
          { text: `${step.nextPct}%`, accent: true },
          { text: ` of ${lc(insights.ladder.to)}-level postings but only ${step.yourPct}% at your level — promotion vocabulary.` },
        ],
        href: "/coach",
        cta: cta("/coach"),
      });
    }
    const cert = insights.certs[0];
    if (cert) {
      rest.push({
        parts: [
          { text: cert.label, strong: true },
          { text: " is named in " },
          { text: String(cert.jobs), accent: true },
          { text: " live postings in your field right now." },
        ],
        href: "/coach",
        cta: cta("/coach"),
      });
    }
    if ((insights.momentum?.fresh7 ?? 0) >= 3) {
      rest.push({
        parts: [
          { text: String(insights.momentum!.fresh7), accent: true },
          { text: " postings landed in your field in the last 7 days — fresh listings draw the least competition." },
        ],
        href: "/coach",
        cta: "See where you stand →",
      });
    }
  }

  // Interleave the lenses so day N and day N+1 feel different.
  const pool: CoachTip[] = [];
  const lists = [news, moves, pairs, gaps, rest];
  for (let i = 0; pool.length < news.length + moves.length + pairs.length + gaps.length + rest.length; i++) {
    for (const l of lists) if (l[i]) pool.push(l[i]);
  }

  if (pool.length === 0) {
    pool.push({
      parts: [{ text: "Keep your skills current — as your profile sharpens, so do your matches." }],
      href: "/coach",
      cta: cta("/coach"),
    });
  }
  return pool;
}

/** Deterministic daily pick (UTC day index), plus a manual "another tip"
 *  offset — reloading never shuffles, tomorrow rotates on its own. */
export function pickTip(pool: CoachTip[], manualOffset: number): { tip: CoachTip; index: number; count: number } {
  const day = Math.floor(Date.now() / 86_400_000);
  const index = ((day + manualOffset) % pool.length + pool.length) % pool.length;
  return { tip: pool[index], index, count: pool.length };
}
