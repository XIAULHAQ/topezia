/**
 * matchVersion — the key under which rerank scores are cached — computed
 * from what the reranker actually reads. Phase 1 §3.3 of
 * docs/ai-cost-strategy.md.
 *
 * Until 2026-08-19 every profile save set matchVersion = randomUUID(), so
 * fixing a typo in your name, toggling "open to work" or changing a
 * relocation preference re-scored your whole top-12 (~$0.013) and evicted
 * the insights cache. The reranker never saw any of those fields.
 *
 * Now the version is a hash of EXACTLY the candidate block rerankBatch
 * builds — headline role, seniority, years, skills (name + proficiency +
 * tier), industries, location, salary target/period, work authorization —
 * plus RERANK_PROMPT_VERSION. Consequences, all intended:
 *   - an edit that doesn't touch those fields keeps every cached score;
 *   - reverting an edit lands back on the previous hash, so any rows that
 *     survived (unique per profile+job, so only the ones not re-scored in
 *     between) are hits again;
 *   - a prompt or model change bumps RERANK_PROMPT_VERSION and re-scores
 *     everyone, once, on purpose;
 *   - the anon→account merge can move scores across (adoptMatchScores):
 *     rows carry their hash, so they only ever hit if the surviving profile
 *     reads the same, which is the "same person, same resume" case.
 *
 * Profiles still on a UUID version keep it until their next save, when the
 * hash replaces it — one last full rerank per legacy profile, then stable.
 *
 * The insights cache (lib/matching/insights.ts) used to ride on this too;
 * it now keys on Profile.updatedAt, so "any edit refreshes insights" holds
 * without dragging the reranker along.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Bump when RERANK_PROMPT, RERANK_MODEL or the job snippet shape in
 * lib/matching/match.ts changes — anything that would make an old score
 * not what today's reranker would say.
 */
export const RERANK_PROMPT_VERSION = "2026-08-19";

export type MatchVersionInputs = {
  headlineRoleId: string | null;
  seniority: string | null;
  yearsExperience: number | null;
  currentLocation: string | null;
  industries: string[];
  salaryTarget: number | null;
  salaryPeriod: string | null;
  workAuthorization: string | null;
  skills: { tier: string | null; proficiency: string | null; skill: { name: string } }[];
};

/** Pure: same inputs → same version, regardless of array order. */
export function computeMatchVersion(p: MatchVersionInputs): string {
  const canonical = {
    v: RERANK_PROMPT_VERSION,
    role: p.headlineRoleId,
    sen: p.seniority ?? "NOT_APPLICABLE",
    yrs: p.yearsExperience,
    loc: p.currentLocation?.trim() || null,
    ind: [...p.industries].map((s) => s.trim()).filter(Boolean).sort(),
    sal: p.salaryTarget,
    per: p.salaryPeriod,
    auth: p.workAuthorization ?? "NOT_SPECIFIED",
    skills: p.skills
      .map((s) => `${s.skill.name}|${s.tier === "SECONDARY" ? "S" : "C"}|${s.proficiency ?? ""}`)
      .sort(),
  };
  return `h:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32)}`;
}

const SELECT = {
  matchVersion: true,
  headlineRoleId: true,
  seniority: true,
  yearsExperience: true,
  currentLocation: true,
  industries: true,
  salaryTarget: true,
  salaryPeriod: true,
  workAuthorization: true,
  skills: { select: { tier: true, proficiency: true, skill: { select: { name: true } } } },
} as const;

/**
 * Recompute from the database and store it if it changed. Call AFTER the
 * profile row and its ProfileSkill rows are written — the hash reads both.
 * Returns the version in force. Never throws into a save: a failure here
 * leaves the old version, which at worst means one cache miss more.
 */
export async function refreshMatchVersion(profileId: string): Promise<string | null> {
  try {
    const p = await prisma.profile.findUnique({ where: { id: profileId }, select: SELECT });
    if (!p) return null;
    const version = computeMatchVersion(p);
    if (p.matchVersion !== version) {
      await prisma.profile.update({ where: { id: profileId }, data: { matchVersion: version } });
    }
    return version;
  } catch (err) {
    console.error("[match-version] refresh failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The anon→account merge, when the account already has a profile and the
 * anonymous one is discarded: carry its scores over instead of deleting them.
 * A job the account already has a score for keeps the account's row; the
 * rest are re-keyed. Because rows carry the hash they were scored under,
 * a moved row is only ever served if the surviving profile hashes the same
 * — otherwise it is an inert row that the next rerank overwrites.
 */
export async function adoptMatchScores(fromProfileId: string, toProfileId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM "MatchScore" a USING "MatchScore" b
       WHERE a."profileId" = ${fromProfileId} AND b."profileId" = ${toProfileId} AND a."jobId" = b."jobId"`;
    await prisma.matchScore.updateMany({ where: { profileId: fromProfileId }, data: { profileId: toProfileId } });
  } catch (err) {
    // Fall back to the old behaviour: the rows go with the profile.
    console.error("[match-version] adopt failed:", err instanceof Error ? err.message : err);
    await prisma.matchScore.deleteMany({ where: { profileId: fromProfileId } }).catch(() => {});
  }
}
