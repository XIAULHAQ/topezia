/**
 * Profile insights — the honesty mirror (Panel 3) and roadmap (Panel 4).
 *
 * Both are the same move: diff the person against the real job corpus. Nothing
 * here is invented — every number is counted from live postings in the user's
 * field that they could actually take (country-eligible).
 *
 * Deliberately NOT salary-denominated: only ~6% of postings list pay, so a
 * salary "market median" would be noise, and years-of-experience isn't
 * extracted from postings at all. We anchor on what the corpus actually holds:
 * skills (100% coverage, ~8/job), seniority (100%), and certifications named in
 * the description text. If a real salary-data source lands later, add that lens
 * then — don't fake it now.
 */
import { prisma } from "@/lib/prisma";
import { REGION_MEMBERS } from "@/lib/ingestion/normalize-rules";

const SENIORITY_RANK: Record<string, number> = {
  INTERN: 1, JUNIOR: 2, MID: 3, SENIOR: 4, LEAD: 5, EXEC: 6, NOT_APPLICABLE: 0,
};

// Certs worth counting when they appear in a posting. The number is "postings
// that name it", never a claim that the cert causes an outcome.
const CERT_PATTERNS: { label: string; like: string }[] = [
  { label: "CKA (Kubernetes)", like: "%CKA%" },
  { label: "AWS certification", like: "%AWS Certified%" },
  { label: "CPA", like: "%CPA%" },
  { label: "CFA", like: "%CFA%" },
  { label: "PMP", like: "%PMP%" },
  { label: "CISSP", like: "%CISSP%" },
  { label: "Salesforce certification", like: "%Salesforce Certified%" },
  { label: "Google Cloud certification", like: "%Google Cloud Certified%" },
  { label: "Azure certification", like: "%Azure Certified%" },
  { label: "SHRM / HR certification", like: "%SHRM%" },
];

export interface SkillGap {
  skill: string;
  jobsWanting: number; // postings in your field that ask for it
  pct: number; // of your target jobs
  youHave: string | null; // your proficiency, or null if you don't list it
}

export interface ProfileInsights {
  fieldLabel: string | null; // "backend engineer roles", or null if we can't scope
  targetJobs: number; // eligible postings in your field
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null; // share of skills your field asks for that you have
  skillGaps: SkillGap[]; // most-wanted skills you lack or are only familiar with
  certs: { label: string; jobs: number }[]; // certs named in your field's postings
  premiumFrom: number; // index into skillGaps: below this is free, at/after is premium
  inferred: boolean; // field was guessed from matches (no resolved job title) — show a "set your title" nudge
  reliable: boolean; // enough eligible jobs for the percentages to mean something (see MEANINGFUL_MIN)
}

// Below this many eligible in-field jobs, "X% of skills" and "Y% want Z" are
// noise, not signal — on a 12-job sample a single posting swings a stat 8
// points, and "0% coverage" reads as a verdict when it's really thin inventory.
// The UI shows an honest "your market is still thin" note instead.
export const MEANINGFUL_MIN = 10;

/**
 * Eligible-in-your-field job ids for a profile.
 *
 * "Your field" = the vertical of your headline role (falls back to every
 * vertical your skills touch). "Eligible" mirrors the feed: same country, a
 * global-remote job, or a posting whose country we couldn't determine — never
 * hide on absence of evidence.
 */
const ROLE_SCOPE_MIN = 10; // role-scope when it has enough jobs; else widen to the vertical

async function targetJobIds(p: {
  profileId: string;
  country: string | null;
  headlineRoleId: string | null;
  skillIds: string[];
}): Promise<{ ids: string[]; verticalId: string | null; scope: "role" | "vertical" | "none"; label: string | null }> {
  const eligibleRegions = p.country
    ? Object.entries(REGION_MEMBERS).filter(([, m]) => m.includes(p.country!)).map(([r]) => r)
    : [];
  // MUST match eligibleIn() in match.ts, or the mirror counts jobs the feed
  // can't actually show. A country-unknown job is eligible only when its remote
  // scope is ALSO unknown — a null-country job scoped to EMEA is not open to a
  // seeker in Pakistan.
  const eligibility = p.country
    ? {
        OR: [
          { country: p.country },
          { remoteScope: "GLOBAL" },
          { remoteScope: p.country },
          { remoteScope: { in: eligibleRegions } },
          { AND: [{ country: null }, { remoteScope: null }] },
        ],
      }
    : {}; // no country known → filter nothing (mirrors eligibleIn)

  // Prefer the person's ACTUAL role — "backend engineer" jobs, not the whole
  // "tech & software" vertical, which would surface frontend skills as gaps for
  // a backend engineer. Fall back to the vertical only when the role is too thin
  // to say anything (e.g. a niche title with 4 postings).
  if (p.headlineRoleId) {
    const role = await prisma.role.findUnique({ where: { id: p.headlineRoleId }, select: { verticalId: true, name: true } });
    const roleJobs = await prisma.job.findMany({
      where: { status: "LIVE", roleId: p.headlineRoleId, ...eligibility },
      select: { id: true },
      take: 4000,
    });
    if (roleJobs.length >= ROLE_SCOPE_MIN) {
      return { ids: roleJobs.map((r) => r.id), verticalId: role?.verticalId ?? null, scope: "role", label: role?.name?.toLowerCase() ?? null };
    }
    if (role?.verticalId) {
      return scopeToVertical(role.verticalId, eligibility);
    }
  }

  // No resolved headline role (their title didn't map to the taxonomy). Infer
  // the field from their embedding — the dominant vertical among the jobs the
  // matcher already finds closest to them. Skill-count inference mislabels
  // (a marketer's business-development skills swamp into sales); the embedding
  // knows they're marketing because it matched them to marketing jobs.
  if (p.profileId) {
    const rows = await prisma.$queryRawUnsafe<{ verticalId: string; n: number }[]>(
      `SELECT j."verticalId", COUNT(*)::int AS n
       FROM "Job" j CROSS JOIN "Profile" p
       WHERE p.id = $1 AND p.embedding IS NOT NULL AND j.status = 'LIVE' AND j.embedding IS NOT NULL
       AND (
         $2::text IS NULL OR j."remoteScope" = 'GLOBAL' OR j.country = $2
         OR j."remoteScope" = $2 OR j."remoteScope" = ANY($3::text[])
         OR (j.country IS NULL AND j."remoteScope" IS NULL)
       )
       AND j."verticalId" IN (
         SELECT "verticalId" FROM "Job" j2
         WHERE j2.id IN (
           SELECT j3.id FROM "Job" j3 CROSS JOIN "Profile" p3
           WHERE p3.id = $1 AND p3.embedding IS NOT NULL AND j3.status = 'LIVE' AND j3.embedding IS NOT NULL
           ORDER BY j3.embedding <=> p3.embedding LIMIT 50
         )
       )
       GROUP BY j."verticalId" ORDER BY n DESC LIMIT 1`,
      p.profileId, p.country, eligibleRegions
    );
    if (rows[0]) {
      const vName = (await prisma.vertical.findUnique({ where: { id: rows[0].verticalId }, select: { name: true, slug: true } }));
      if (vName && vName.slug !== "unsorted") {
        const scoped = await scopeToVertical(rows[0].verticalId, eligibility);
        if (scoped.ids.length >= 5) return scoped;
      }
    }
  }

  return { ids: [], verticalId: null, scope: "none", label: null };
}

async function scopeToVertical(
  verticalId: string,
  eligibility: object
): Promise<{ ids: string[]; verticalId: string | null; scope: "vertical"; label: string | null }> {
  const vJobs = await prisma.job.findMany({ where: { status: "LIVE", verticalId, ...eligibility }, select: { id: true }, take: 4000 });
  const vName = (await prisma.vertical.findUnique({ where: { id: verticalId }, select: { name: true } }))?.name?.toLowerCase() ?? null;
  return { ids: vJobs.map((r) => r.id), verticalId, scope: "vertical", label: vName };
}

export async function getProfileInsights(profileId: string): Promise<ProfileInsights | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      country: true, headlineRoleId: true, seniority: true,
      skills: { select: { skillId: true, proficiency: true, skill: { select: { name: true } } } },
    },
  });
  if (!profile) return null;

  const mySkills = new Map(profile.skills.map((s) => [s.skillId, s.proficiency]));
  const { ids, scope, label } = await targetJobIds({
    profileId,
    country: profile.country,
    headlineRoleId: profile.headlineRoleId,
    skillIds: [...mySkills.keys()],
  });
  // Field was guessed (no resolved job title) → the UI shows a "set your title
  // to refine" nudge so an approximate field never reads as a confident claim.
  const inferred = !profile.headlineRoleId && scope !== "none";

  const fieldLabel = label ? `${label} roles${scope === "vertical" ? " (broad)" : ""}` : null;

  // Too thin to map anything honestly — but keep the field label so the UI can
  // say WHY (e.g. "only 1 marketing job open to your region yet") instead of
  // silently showing nothing.
  if (ids.length < 5) {
    return { fieldLabel, targetJobs: ids.length, seniority: null, coveragePct: null,
      skillGaps: [], certs: [], premiumFrom: 2, inferred, reliable: false };
  }

  // Skill demand across your field: how many target postings ask for each skill.
  const demand = await prisma.jobSkill.groupBy({
    by: ["skillId"],
    where: { jobId: { in: ids } },
    _count: { jobId: true },
  });
  const skillNames = new Map(
    (await prisma.skill.findMany({ where: { id: { in: demand.map((d) => d.skillId) } }, select: { id: true, name: true } }))
      .map((s) => [s.id, s.name])
  );

  // Match your skills to demanded skills by NORMALIZED name, not exact skillId.
  // The taxonomy fragments the same concept into distinct skills — "social media
  // marketing" vs "Social media", "creative team leadership" vs "Team
  // leadership" — so exact-id matching reported 0% coverage for a marketer whose
  // skills clearly overlap. Token-subset match lines the concepts up: your skill
  // covers a demanded one when one's word-set contains the other's.
  const RANK: Record<string, number> = { FAMILIAR: 1, PROFICIENT: 2, ADVANCED: 3, EXPERT: 4 };
  const STOP = new Set(["and", "the", "of", "for", "a", "an", "with", "to", "in"]);
  const toks = (name: string) =>
    new Set(name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)));
  const mine = profile.skills.map((s) => ({ tokens: toks(s.skill.name), prof: s.proficiency }));
  const covered = (a: Set<string>, d: Set<string>) => {
    if (!a.size || !d.size) return false;
    const [sm, big] = a.size <= d.size ? [a, d] : [d, a];
    for (const t of sm) if (!big.has(t)) return false;
    return true;
  };
  // Your best proficiency in anything that covers this demanded skill, or null.
  const myLevelFor = (demandName: string): string | null => {
    const dt = toks(demandName);
    let best: string | null = null;
    for (const m of mine) {
      if (!covered(m.tokens, dt)) continue;
      const lvl = m.prof ?? "PROFICIENT"; // a listed skill with no set level still counts as had
      if (!best || RANK[lvl] > RANK[best]) best = lvl;
    }
    return best;
  };

  const STRONG = new Set(["PROFICIENT", "ADVANCED", "EXPERT"]);
  // A skill counts as "asked for" at >=2 postings (or 8% of a larger sample).
  // The floor of 3 excluded real signals in thin markets: a marketer's social/
  // campaign skills, wanted by 2 of 12 jobs, were dropped while design tools
  // (wanted by 3-4) dominated — producing 0% coverage for a competent marketer.
  const common = (n: number) => n >= Math.max(2, ids.length * 0.08);
  const gaps: SkillGap[] = demand
    .map((d) => {
      const name = skillNames.get(d.skillId) ?? "—";
      const lvl = myLevelFor(name);
      return { name, jobsWanting: d._count.jobId, lvl, covered: lvl !== null && STRONG.has(lvl) };
    })
    .filter((d) => !d.covered && common(d.jobsWanting))
    .sort((a, b) => b.jobsWanting - a.jobsWanting)
    .slice(0, 6)
    .map((d) => ({
      skill: d.name,
      jobsWanting: d.jobsWanting,
      pct: Math.round((d.jobsWanting / ids.length) * 100),
      youHave: d.lvl,
    }));

  // Coverage: of the distinct skills your field asks for (that matter), how many
  // do you have — matched by normalized name.
  const wanted = demand.filter((d) => common(d._count.jobId));
  const haveCount = wanted.filter((d) => myLevelFor(skillNames.get(d.skillId) ?? "") !== null).length;
  const coveragePct = wanted.length ? Math.round((haveCount / wanted.length) * 100) : null;

  // Seniority fit, from the enum every posting carries.
  let seniority: ProfileInsights["seniority"] = null;
  if (profile.seniority) {
    const myRank = SENIORITY_RANK[profile.seniority] ?? 0;
    const bySen = await prisma.job.groupBy({ by: ["seniority"], where: { id: { in: ids } }, _count: { id: true } });
    let atOrAbove = 0, below = 0;
    for (const b of bySen) {
      const r = SENIORITY_RANK[b.seniority] ?? 0;
      if (r === 0) continue;
      if (r >= myRank) atOrAbove += b._count.id; else below += b._count.id;
    }
    seniority = { level: profile.seniority, atOrAbove, below };
  }

  // Certs named in your field's postings — counted, not recommended. One query
  // per pattern, run in parallel: sequential round-trips made this the slowest
  // part of the endpoint.
  const certCounts = await Promise.all(
    CERT_PATTERNS.map((c) =>
      prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM "Job" WHERE id = ANY($1::text[]) AND "descriptionRaw" ILIKE $2`,
        ids, c.like
      ).then((rows) => ({ label: c.label, jobs: rows[0].n }))
    )
  );
  const certs = certCounts.filter((c) => c.jobs >= 3).sort((a, b) => b.jobs - a.jobs);

  return {
    fieldLabel,
    targetJobs: ids.length,
    seniority,
    coveragePct,
    skillGaps: gaps,
    certs: certs.slice(0, 4),
    premiumFrom: 2, // first 2 gaps free (the diagnosis); the rest is premium later
    inferred,
    reliable: ids.length >= MEANINGFUL_MIN && gaps.length > 0,
  };
}
