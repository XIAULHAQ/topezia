/**
 * AI Career Score — one number for market strength, with every point counted.
 *
 * Same doctrine as the resume strength score: a transparent composite, never a
 * model judgment. Three components, 100 points total:
 *
 *   resume (45) — the resume strength checklist (lib/resume/score.ts), scaled.
 *   market (35) — of the skills your field's LIVE postings actually name, the
 *                 share you cover (lib/matching/insights.ts, pure counting;
 *                 the field itself is scoped by the embedding matcher, which
 *                 is the "AI" in the name).
 *   proof  (20) — published work, received recommendations, publications:
 *                 things other people can check, counted from our own tables.
 *
 * When the person's field has too few eligible live postings to measure, the
 * OVERALL score is null — a number computed on a thin market would be noise
 * wearing a confident face. The computable components still return, so the UI
 * can show what it honestly can.
 *
 * Deliberately free: everything here is a DB count or a pure function — zero
 * model calls. The premium seam is what to DO about the score (Career Coach).
 */
import { prisma } from "@/lib/prisma";
import { sanitizeContent, seedFromProfile, type ResumeContent } from "@/lib/resume/doc";
import { scoreResume } from "@/lib/resume/score";
import { loadProjects, loadQuotes } from "@/lib/resume/load";
import { getProfileInsights, MEANINGFUL_MIN } from "@/lib/matching/insights";

export interface CareerMove {
  label: string;
  href: string;
}

export interface CareerComponent {
  id: "resume" | "market" | "proof";
  label: string;
  points: number | null; // null = not honestly computable (thin market)
  max: number;
  detail: string; // exactly what was counted, in one sentence
}

export interface CareerScore {
  score: number | null; // null when the market component can't be measured
  components: CareerComponent[];
  moves: CareerMove[]; // highest-leverage actions, each pointing at its page
  fieldLabel: string | null; // "backend engineer roles", from insights
  targetJobs: number; // the live-posting denominator behind the market stat
}

const WEIGHTS = { resume: 45, market: 35, proof: 20 } as const;

/** The resume the builder would show right now: the saved doc with its live
 *  fills, or the profile-seeded draft — mirrors GET /api/resume so the score
 *  never disagrees with the page it points people to. */
async function currentResume(profile: {
  id: string;
  fullName: string | null;
  headlineRoleId: string | null;
  currentLocation: string | null;
  workHistory: unknown;
  education: unknown;
  certifications: string[];
  languages: unknown;
  skills: { tier: string; skill: { name: string } }[];
}): Promise<ResumeContent> {
  const doc = await prisma.resumeDoc.findUnique({ where: { profileId: profile.id }, select: { content: true } });
  if (doc) {
    const content = sanitizeContent(doc.content);
    const raw = (doc.content ?? {}) as Record<string, unknown>;
    if (!("projects" in raw)) content.projects = await loadProjects(profile.id);
    content.recommendations = sanitizeContent({ recommendations: await loadQuotes(profile.id) }).recommendations;
    return content;
  }
  const headlineName = profile.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: profile.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;
  return seedFromProfile({
    fullName: profile.fullName,
    headlineName,
    currentLocation: profile.currentLocation,
    workHistory: profile.workHistory,
    education: profile.education,
    certifications: profile.certifications,
    skills: profile.skills.map((s) => ({ name: s.skill.name, tier: s.tier })),
    languages: profile.languages,
    recommendations: await loadQuotes(profile.id),
    projects: await loadProjects(profile.id),
  });
}

export async function getCareerScore(profileId: string): Promise<CareerScore | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      id: true, fullName: true, headlineRoleId: true, currentLocation: true,
      workHistory: true, education: true, certifications: true, languages: true,
      skills: { select: { tier: true, skill: { select: { name: true } } } },
    },
  });
  if (!profile) return null;

  const [content, insights, portfolioCount, quoteCount, pubCount] = await Promise.all([
    currentResume(profile),
    getProfileInsights(profileId),
    prisma.portfolio.count({ where: { profileId, status: "PUBLISHED" } }),
    prisma.endorsement.count({ where: { profileId, status: "SUBMITTED", visible: true } }),
    prisma.publication.count({ where: { profileId } }),
  ]);

  // ── resume (45) ──
  const strength = scoreResume(content);
  const resumePoints = Math.round((strength.score * WEIGHTS.resume) / 100);

  // ── market (35) ── honest only with a real denominator. NOT insights.reliable,
  // which also requires open gaps — a person covering everything their field
  // asks for has no gaps but the most measurable market strength there is.
  const targetJobs = insights?.targetJobs ?? 0;
  const coverage = insights?.coveragePct ?? null;
  const measurable = targetJobs >= MEANINGFUL_MIN && coverage !== null;
  const marketPoints = measurable ? Math.round((coverage! * WEIGHTS.market) / 100) : null;
  const fieldLabel = insights?.fieldLabel ?? null;

  // ── proof (20) ── the third check is depth-by-any-route, so 20/20 stays
  // reachable for people who will never write a book.
  const proofChecks = [
    { met: portfolioCount >= 1, pts: 8 },
    { met: quoteCount >= 1, pts: 8 },
    { met: portfolioCount >= 2 || quoteCount >= 2 || pubCount >= 1, pts: 4 },
  ];
  const proofPoints = proofChecks.reduce((s, c) => s + (c.met ? c.pts : 0), 0);

  if (process.env.NODE_ENV !== "production") {
    const total = WEIGHTS.resume + WEIGHTS.market + proofChecks.reduce((s, c) => s + c.pts, 0);
    if (total !== 100) throw new Error(`Career score weights sum to ${total}, not 100`);
  }

  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const components: CareerComponent[] = [
    {
      id: "resume",
      label: "Resume strength",
      points: resumePoints,
      max: WEIGHTS.resume,
      detail: `${strength.metCount} of ${strength.checks.length} resume checks met (${strength.score}/100) — every check is listed in the Resume Builder.`,
    },
    {
      id: "market",
      label: "Market coverage",
      points: marketPoints,
      max: WEIGHTS.market,
      detail: measurable
        ? `You cover ${coverage}% of the skills named across ${targetJobs} live ${fieldLabel ?? "postings in your field"} open to you.`
        : targetJobs > 0
          ? `Only ${n(targetJobs, "live posting")} in your field ${targetJobs === 1 ? "is" : "are"} open to your region — too few to measure coverage honestly.`
          : "We can't scope your field yet — set your role so we know which postings to count you against.",
    },
    {
      id: "proof",
      label: "Proof of work",
      points: proofPoints,
      max: WEIGHTS.proof,
      detail: `${n(portfolioCount, "published piece")}, ${n(quoteCount, "recommendation")} received, ${n(pubCount, "publication")}.`,
    },
  ];

  // ── moves ── the highest-leverage next actions, each linking to where it's
  // done. Resume hints come straight from the unmet checks (biggest first).
  const moves: CareerMove[] = [];
  for (const ch of strength.checks.filter((c) => !c.met).slice(0, 2)) {
    moves.push({ label: ch.hint, href: "/resume" });
  }
  if (measurable && insights) {
    for (const g of insights.skillGaps.slice(0, insights.premiumFrom).slice(0, 2)) {
      moves.push({ label: `Close the ${g.skill} gap — named by ${g.pct}% of your target postings.`, href: "/coach" });
    }
  }
  if (portfolioCount === 0) moves.push({ label: "Publish a piece of work — proof of work beats claims of work.", href: "/portfolio/new" });
  if (quoteCount === 0) moves.push({ label: "Request a recommendation from someone you've actually worked with.", href: "/profile" });

  return {
    score: marketPoints === null ? null : resumePoints + marketPoints + proofPoints,
    components,
    moves: moves.slice(0, 5),
    fieldLabel,
    targetJobs,
  };
}
