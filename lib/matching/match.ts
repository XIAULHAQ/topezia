/**
 * Matching engine — spec §5.
 *
 * Stage 1 (retrieval, cheap, every feed load): hard filters + pgvector cosine
 * similarity profile↔job.
 * Stage 2 (rerank + explain, small model): honest 0-100 score, matched/gap
 * skills, and a one-line "why" per job.
 *
 * Honesty rules are product law (§5): the score distribution must be earned,
 * sub-70 matches are shown (not hidden), and gap skills are always surfaced.
 *
 * NOTE: spec wants stage-2 results cached per (profile-version × job). This MVP
 * reranks live on each call for a bounded candidate set — correct, just not yet
 * cached. A MatchScore cache table is the follow-up before real feed traffic.
 */

import { prisma } from "@/lib/prisma";
import type { EmploymentType, RemoteType, SalaryPeriod } from "@prisma/client";

const RERANK_MODEL = "claude-haiku-4-5-20251001";

export interface JobMatch {
  jobId: string;
  title: string;
  company: string;
  verticalSlug: string;
  cardLayout: string;
  source: string;
  sourceUrl: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  locationState: string | null;
  lastVerifiedAt: Date;
  similarity: number; // 0-1 cosine
  score: number; // 0-100 (rerank when scored, else provisional from similarity)
  matchedSkills: string[];
  gapSkills: string[];
  whyLine: string;
  pending: boolean; // true = not yet LLM-scored (provisional); enriched by rerank pass
}

interface CandidateRow {
  id: string;
  titleRaw: string;
  titleNormalized: string | null;
  companyName: string;
  source: string;
  sourceUrl: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  locationState: string | null;
  lastVerifiedAt: Date;
  descriptionRaw: string;
  verticalSlug: string;
  cardLayout: string;
  similarity: number;
}

export interface MatchOptions {
  retrieveN?: number; // candidates kept after hard filters (default 30)
  rerankN?: number; // how many of those get an LLM score (default 12)
  rerank?: boolean; // false = Stage-1 only (fast, provisional scores, no LLM)
}

export async function getMatches(profileId: string, opts: MatchOptions = {}): Promise<JobMatch[]> {
  const retrieveN = opts.retrieveN ?? 30;
  const rerankN = opts.rerankN ?? 12;
  const rerank = opts.rerank ?? true;

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      seniority: true,
      yearsExperience: true,
      employmentTypes: true,
      remoteTypes: true,
      salaryFloor: true,
      salaryTarget: true,
      salaryPeriod: true,
      currentLocation: true,
      industries: true,
      workAuthorization: true,
      headlineRoleId: true,
      matchVersion: true,
      skills: { select: { proficiency: true, skill: { select: { name: true } } } },
    },
  });
  if (!profile) return [];
  const version = profile.matchVersion ?? "unversioned";

  // Annotate with proficiency where we have it, so the reranker can tell an
  // expert apart from someone who listed a tool once.
  const profileSkillNames = profile.skills.map((s) =>
    s.proficiency ? `${s.skill.name} (${s.proficiency.toLowerCase()})` : s.skill.name
  );
  // Profile.headlineRoleId is a bare fk (no relation defined in schema), so
  // resolve the role name in a separate lookup.
  const headlineRoleName = profile.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: profile.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;

  // Stage 1 — vector retrieval. Pull a generous candidate pool ordered by
  // cosine similarity, then apply hard filters in JS (small pool, keeps the
  // SQL free of array-binding). The `AND p.embedding IS NOT NULL` means this
  // returns 0 rows when the profile has no embedding yet, in which case we fall
  // back to recency — one fewer round-trip than checking embedding separately.
  const selectCols = `j.id, j."titleRaw", j."titleNormalized", j."companyName", j.source::text AS source,
      j."sourceUrl", j."remoteType", j."employmentType", j."salaryMin", j."salaryMax",
      j."salaryPeriod", j."locationState", j."lastVerifiedAt", j."descriptionRaw",
      v.slug AS "verticalSlug", v."cardLayout"::text AS "cardLayout"`;

  let candidates = await prisma.$queryRawUnsafe<CandidateRow[]>(
    `SELECT ${selectCols}, 1 - (j.embedding <=> p.embedding) AS similarity
     FROM "Job" j
     JOIN "Vertical" v ON v.id = j."verticalId"
     CROSS JOIN "Profile" p
     WHERE p.id = $1 AND p.embedding IS NOT NULL AND j.status = 'LIVE' AND j.embedding IS NOT NULL
     ORDER BY j.embedding <=> p.embedding
     LIMIT 100`,
    profileId
  );

  if (candidates.length === 0) {
    candidates = await prisma.$queryRawUnsafe<CandidateRow[]>(
      `SELECT ${selectCols}, 0::float8 AS similarity
       FROM "Job" j
       JOIN "Vertical" v ON v.id = j."verticalId"
       WHERE j.status = 'LIVE'
       ORDER BY j."lastVerifiedAt" DESC
       LIMIT 100`
    );
  }

  // Hard filters (spec §5): employment type, remote type, salary floor.
  // Salary is only comparable when the periods match; otherwise the job passes
  // (salary-absent / incomparable jobs pass but rank lower via the rerank).
  const empPrefs = new Set(profile.employmentTypes);
  const remotePrefs = new Set(profile.remoteTypes);
  const filtered = candidates.filter((j) => {
    if (empPrefs.size && !empPrefs.has(j.employmentType)) return false;
    if (remotePrefs.size && !remotePrefs.has(j.remoteType)) return false;
    if (
      profile.salaryFloor != null &&
      j.salaryMax != null &&
      j.salaryPeriod != null &&
      profile.salaryPeriod != null &&
      j.salaryPeriod === profile.salaryPeriod &&
      j.salaryMax < profile.salaryFloor
    ) {
      return false;
    }
    return true;
  });

  const pool = filtered.slice(0, retrieveN);
  const toRerank = pool.slice(0, rerankN);

  // Stage 2 — rerank cache (spec §5). Reuse cached scores stamped with the
  // current matchVersion; only run the LLM for jobs not yet cached. On a warm
  // cache this call makes zero LLM requests and zero writes.
  const cachedRows = await prisma.matchScore.findMany({
    where: { profileId, matchVersion: version, jobId: { in: toRerank.map((j) => j.id) } },
    select: { jobId: true, score: true, matchedSkills: true, gapSkills: true, whyLine: true },
  });
  const scores = new Map<string, RerankResult>(
    cachedRows.map((r) => [r.jobId, { score: r.score, matchedSkills: r.matchedSkills, gapSkills: r.gapSkills, whyLine: r.whyLine }])
  );

  const uncached = toRerank.filter((j) => !scores.has(j.id));
  if (rerank && uncached.length > 0) {
    const fresh = await rerankBatch(
      {
        headline: headlineRoleName,
        seniority: profile.seniority ?? "NOT_APPLICABLE",
        yearsExperience: profile.yearsExperience,
        skills: profileSkillNames,
        currentLocation: profile.currentLocation,
        industries: profile.industries,
        salaryTarget: profile.salaryTarget,
        salaryPeriod: profile.salaryPeriod,
        workAuthorization: profile.workAuthorization,
      },
      uncached
    );
    for (const [jobId, r] of fresh) scores.set(jobId, r);
    // Write the cache in two batched statements instead of one upsert per job
    // (N sequential round-trips was a big chunk of the cold-load latency).
    const freshIds = [...fresh.keys()];
    if (freshIds.length > 0) {
      await prisma.matchScore.deleteMany({ where: { profileId, jobId: { in: freshIds } } });
      await prisma.matchScore.createMany({
        data: freshIds.map((jobId) => ({ profileId, jobId, matchVersion: version, ...fresh.get(jobId)! })),
      });
    }
  }

  const matches: JobMatch[] = toRerank.map((j) => {
    const r = scores.get(j.id);
    return {
      jobId: j.id,
      title: j.titleRaw,
      company: j.companyName,
      verticalSlug: j.verticalSlug,
      cardLayout: j.cardLayout,
      source: j.source,
      sourceUrl: j.sourceUrl,
      remoteType: j.remoteType,
      employmentType: j.employmentType,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      salaryPeriod: j.salaryPeriod,
      locationState: j.locationState,
      lastVerifiedAt: j.lastVerifiedAt,
      similarity: j.similarity,
      // Provisional score from cosine similarity until the LLM rerank lands.
      score: r?.score ?? Math.round(j.similarity * 100),
      matchedSkills: r?.matchedSkills ?? [],
      gapSkills: r?.gapSkills ?? [],
      whyLine: r?.whyLine ?? "",
      pending: !r,
    };
  });

  // Honest ordering: best score first, but keep the sub-70s in the list
  // (Screen B renders them compact with a "Why low?" affordance).
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

interface RerankResult {
  score: number;
  matchedSkills: string[];
  gapSkills: string[];
  whyLine: string;
}

const RERANK_PROMPT = `You are an honest job-matching reranker for a job seeker. For each job, score fit 0-100 and explain it. Return ONLY a JSON array, one object per job, in the same order:
[ { "jobId": string, "score": number, "matchedSkills": string[], "gapSkills": string[], "whyLine": string } ]

Scoring (be honest — the distribution must be EARNED, do not cluster everything at 85+):
- 85-100: strong fit — skills, seniority, and trajectory all align.
- 70-84: good fit with a gap or two.
- 50-69: plausible but real gaps.
- <50: weak fit; still score it truthfully.
Weigh: skill overlap (required skills matter most), seniority fit, sensible next career step, and preference alignment.
- Skills may be annotated with proficiency (familiar/proficient/advanced/expert). A job wanting deep use of a skill the candidate is only FAMILIAR with is a gap, even though they technically list it.
- Industry overlap is a mild plus, never a requirement — people change industries.
- If a salary target is given it is an aspiration, not a floor: a job below it is not disqualified, but say so plainly in whyLine if the posted range clearly falls short.
- If the candidate needs visa sponsorship, mention it in whyLine ONLY when the posting itself speaks to sponsorship or work authorization. Never assume from the company or country, and never lower a score over sponsorship the posting is silent about.
- matchedSkills: the candidate's skills this job actually wants.
- gapSkills: important skills the job wants that the candidate lacks. Never inflate; empty array if none.
- whyLine: ONE plain-language sentence citing specifics (e.g. "Your caching and latency work is exactly what the post emphasizes"). For weak fits, say why honestly.`;

async function rerankBatch(
  profile: {
    headline: string | null;
    seniority: string;
    yearsExperience: number | null;
    skills: string[];
    currentLocation: string | null;
    industries: string[];
    salaryTarget: number | null;
    salaryPeriod: string | null;
    workAuthorization: string;
  },
  jobs: CandidateRow[]
): Promise<Map<string, RerankResult>> {
  const out = new Map<string, RerankResult>();
  if (jobs.length === 0 || !process.env.ANTHROPIC_API_KEY) return out;

  const jobsPayload = jobs.map((j) => ({
    jobId: j.id,
    title: j.titleNormalized || j.titleRaw,
    description: stripToSnippet(j.descriptionRaw, 500),
  }));

  const userMsg = `CANDIDATE:
- headline role: ${profile.headline ?? "unknown"}
- seniority: ${profile.seniority}
- years experience: ${profile.yearsExperience ?? "unknown"}
- skills: ${profile.skills.join(", ") || "none listed"}
- industries worked in: ${profile.industries.join(", ") || "unknown"}
- based in: ${profile.currentLocation ?? "unknown"}
- salary target: ${profile.salaryTarget != null ? `${profile.salaryTarget} per ${(profile.salaryPeriod ?? "year").toLowerCase()} (aspiration, not a filter)` : "not given"}
- work authorization: ${profile.workAuthorization === "NOT_SPECIFIED" ? "not given" : profile.workAuthorization}

JOBS (${jobs.length}):
${JSON.stringify(jobsPayload)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        max_tokens: 2000,
        temperature: 0,
        system: RERANK_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) return out; // fall back to similarity scores
    const data = await res.json();
    const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "[]";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(cleaned) as (RerankResult & { jobId: string })[];
    for (const r of arr) {
      if (!r?.jobId) continue;
      out.set(r.jobId, {
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        matchedSkills: Array.isArray(r.matchedSkills) ? r.matchedSkills : [],
        gapSkills: Array.isArray(r.gapSkills) ? r.gapSkills : [],
        whyLine: typeof r.whyLine === "string" ? r.whyLine : "",
      });
    }
  } catch {
    // Leave `out` partial — callers fall back to similarity-derived scores.
  }
  return out;
}

function stripToSnippet(html: string, max: number): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
