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
//
// `rx` is a POSIX word-boundary regex (matched with ILIKE's regex cousin `~*`),
// NOT a substring LIKE. This matters: a raw `%CKA%` substring matched the letters
// "cka" inside ordinary words — above all "pac{kag}e"/"packaging", plus
// "cli{cka}ble", "sta{cka}ble", "ha{cka}thon" — so a Product Designer's field
// (full of "packaging design" and "clickable prototypes") showed CKA (Kubernetes)
// as a top cert from 15 postings, none of which actually name the cert. A true
// `\yCKA\y` match returns zero postings corpus-wide. Word boundaries also trim the
// same substring inflation for the shorter acronyms (CPA, PMP) elsewhere.
const CERT_PATTERNS: { label: string; rx: string }[] = [
  { label: "CKA (Kubernetes)", rx: "\\yCKA\\y" },
  { label: "AWS certification", rx: "\\yAWS Certified\\y" },
  { label: "CPA", rx: "\\yCPA\\y" },
  { label: "CFA", rx: "\\yCFA\\y" },
  { label: "PMP", rx: "\\yPMP\\y" },
  { label: "CISSP", rx: "\\yCISSP\\y" },
  { label: "Salesforce certification", rx: "\\ySalesforce Certified\\y" },
  { label: "Google Cloud certification", rx: "\\yGoogle Cloud Certified\\y" },
  { label: "Azure certification", rx: "\\yAzure Certified\\y" },
  { label: "SHRM / HR certification", rx: "\\ySHRM\\y" },
];

export interface SkillGap {
  skill: string;
  jobsWanting: number; // postings in your field that ask for it
  pct: number; // of your target jobs
  youHave: string | null; // your proficiency, or null if you don't list it
}

// "Learn this next" — a gap that rides along with a skill you already have.
// Counted as: of the postings asking for `withSkill` (yours), what share also
// ask for `skill` (which you lack). Sequencing signal, not a promise.
export interface NextSkill {
  skill: string; // the gap
  withSkill: string; // your skill it co-occurs with
  pairJobs: number; // postings naming both
  pairPct: number; // share of postings wanting withSkill that also want skill
}

// What the next seniority level's postings name that yours don't — the
// promotion diff, counted from the same in-field postings.
export interface LadderStep {
  skill: string;
  nextPct: number; // % of next-level postings naming it
  yourPct: number; // % of your-level postings naming it
  jobs: number; // next-level postings naming it
}

// How fresh the field's live inventory is, from the dates the postings
// themselves declare. Deliberately NOT a growth claim: week-over-week "added"
// from our own tracking would be an ingestion artifact until we have real
// history, and posting lifetimes need observed expirations — both stay null
// until the data can back them (see the thresholds in getProfileInsights).
export interface Momentum {
  fresh7: number; // live in-field postings posted in the last 7 days
  fresh30: number;
  dated: number; // postings carrying a source date (the denominator)
  medianAgeDays: number; // median age of the dated live postings
  corpusMedianAgeDays: number | null; // same stat across all fields, for contrast
  ageMix: { under1w: number; w1to4: number; over4w: number };
  weeklyAdded: { weekStart: string; n: number }[] | null; // unlocks at >=3 full ingestion weeks
  medianLifetimeDays: number | null; // unlocks at >=20 observed in-field expirations
}

export interface ProfileInsights {
  fieldLabel: string | null; // "backend engineer roles", or null if we can't scope
  targetJobs: number; // eligible postings in your field
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null; // share of skills your field asks for that you have
  skillGaps: SkillGap[]; // most-wanted skills you lack or are only familiar with
  nextSkills: NextSkill[]; // gaps that co-occur with skills you already have
  momentum: Momentum | null; // null when the field is too thin or nothing is dated
  ladder: {
    from: string; // your seniority
    to: string; // the next level up
    atLevelJobs: number; // in-field postings at your level
    nextLevelJobs: number; // in-field postings at the next level
    steps: LadderStep[];
  } | null; // null when either band is too thin to diff honestly
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
}): Promise<{ ids: string[]; verticalId: string | null; scope: "role" | "vertical" | "none"; label: string | null; fieldWhere: object | null }> {
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
      return {
        ids: roleJobs.map((r) => r.id), verticalId: role?.verticalId ?? null, scope: "role",
        label: role?.name?.toLowerCase() ?? null,
        fieldWhere: { roleId: p.headlineRoleId, ...eligibility },
      };
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

  return { ids: [], verticalId: null, scope: "none", label: null, fieldWhere: null };
}

async function scopeToVertical(
  verticalId: string,
  eligibility: object
): Promise<{ ids: string[]; verticalId: string | null; scope: "vertical"; label: string | null; fieldWhere: object }> {
  const vJobs = await prisma.job.findMany({ where: { status: "LIVE", verticalId, ...eligibility }, select: { id: true }, take: 4000 });
  const vName = (await prisma.vertical.findUnique({ where: { id: verticalId }, select: { name: true } }))?.name?.toLowerCase() ?? null;
  return { ids: vJobs.map((r) => r.id), verticalId, scope: "vertical", label: vName, fieldWhere: { verticalId, ...eligibility } };
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
  const { ids, scope, label, fieldWhere } = await targetJobIds({
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
      skillGaps: [], nextSkills: [], momentum: null, ladder: null, certs: [], premiumFrom: 2, inferred, reliable: false };
  }

  // Skill demand across your field. One scan of the per-job rows (~8 skills/job)
  // instead of an aggregate: the raw rows also power the co-occurrence and
  // ladder lenses below, which need to know WHICH jobs share skills, not just
  // how many jobs name each one.
  const jobSkillRows = await prisma.jobSkill.findMany({
    where: { jobId: { in: ids } },
    select: { jobId: true, skillId: true },
  });
  const demand = new Map<string, number>();
  for (const r of jobSkillRows) demand.set(r.skillId, (demand.get(r.skillId) ?? 0) + 1);
  const skillNames = new Map(
    (await prisma.skill.findMany({ where: { id: { in: [...demand.keys()] } }, select: { id: true, name: true } }))
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
  // The taxonomy fragments one concept into spelling/acronym variants —
  // "Data analysis" vs "Data analytics", "GTM strategy" vs "Go-To-Market
  // Strategy". Left raw they count as distinct demanded skills, so the same gap
  // is listed twice in the roadmap and the coverage denominator is inflated
  // (making a competent person look worse than they are). canon() folds the
  // word families that are genuinely the same — conservative on purpose: only
  // stem/expand where the meaning is identical, never merge adjacent-but-
  // distinct skills like "content marketing" vs "content strategy".
  const ACRONYM: Record<string, string> = { gtm: "go market", abm: "account based", cro: "conversion", roi: "return" };
  const stem = (t: string): string => {
    if (/^analy(s|t|z)/.test(t)) return "analyt"; // analysis / analytics / analyze
    if (/^strateg/.test(t)) return "strateg"; // strategy / strategic
    if (/^optimi[sz]/.test(t)) return "optim"; // optimisation / optimization
    if (/^manag/.test(t)) return "manag"; // management / manager / managing
    return t;
  };
  const toks = (name: string): Set<string> => {
    const out = new Set<string>();
    for (const raw of name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)) {
      if (ACRONYM[raw]) { ACRONYM[raw].split(" ").forEach((x) => out.add(x)); continue; }
      const t = stem(raw);
      if (t.length > 1 && !STOP.has(t)) out.add(t);
    }
    return out;
  };
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

  // Collapse taxonomy-duplicate demanded skills into one concept before scoring.
  // Two demanded skills are the same concept when one's canonical token-set
  // contains the other's ("go market strateg" ⊇ "go market"); we keep the
  // higher-demand name as the label and the peak posting-count, so a concept is
  // counted — and shown as a gap — exactly once, never twice.
  const groups: { name: string; tokens: Set<string>; jobs: number }[] = [];
  const groupOf = new Map<string, number>(); // skillId → index into groups
  for (const d of [...demand.entries()]
    .map(([skillId, jobs]) => ({ skillId, name: skillNames.get(skillId) ?? "—", tokens: toks(skillNames.get(skillId) ?? ""), jobs }))
    .sort((a, b) => b.jobs - a.jobs)) {
    const hit = groups.findIndex((g) => covered(g.tokens, d.tokens));
    if (hit >= 0) {
      groups[hit].jobs = Math.max(groups[hit].jobs, d.jobs);
      groupOf.set(d.skillId, hit);
    } else {
      groupOf.set(d.skillId, groups.length);
      groups.push({ name: d.name, tokens: d.tokens, jobs: d.jobs });
    }
  }

  // Per-posting concept sets, and the TRUE per-concept posting count (a job
  // naming both "UX/UI Design" and "UI/UX Design" holds the concept once). The
  // gap list keeps its peak-count semantics above; the pair and ladder shares
  // below divide by these exact counts so a percentage is never inflated by
  // taxonomy duplicates.
  const jobConcepts = new Map<string, Set<number>>();
  for (const r of jobSkillRows) {
    const g = groupOf.get(r.skillId);
    if (g === undefined) continue;
    let set = jobConcepts.get(r.jobId);
    if (!set) jobConcepts.set(r.jobId, (set = new Set()));
    set.add(g);
  }
  const conceptJobs = new Array<number>(groups.length).fill(0);
  for (const set of jobConcepts.values()) for (const g of set) conceptJobs[g]++;

  // A concept counts as "asked for" at >=2 postings (or 8% of a larger sample).
  // The floor of 3 excluded real signals in thin markets: a marketer's social/
  // campaign skills, wanted by 2 of 12 jobs, were dropped while design tools
  // (wanted by 3-4) dominated — producing 0% coverage for a competent marketer.
  const common = (n: number) => n >= Math.max(2, ids.length * 0.08);
  // Your level per concept, computed once — gaps, coverage, co-occurrence and
  // the ladder all key off the same answer to "do you have this".
  const conceptLvl = groups.map((g) => myLevelFor(g.name));
  const strongAt = (i: number) => { const l = conceptLvl[i]; return l !== null && STRONG.has(l); };
  const gaps: SkillGap[] = groups
    .map((d, i) => ({ name: d.name, jobsWanting: d.jobs, lvl: conceptLvl[i], covered: strongAt(i) }))
    .filter((d) => !d.covered && common(d.jobsWanting))
    .sort((a, b) => b.jobsWanting - a.jobsWanting)
    .slice(0, 6)
    .map((d) => ({
      skill: d.name,
      jobsWanting: d.jobsWanting,
      pct: Math.round((d.jobsWanting / ids.length) * 100),
      youHave: d.lvl,
    }));

  // Coverage: of the distinct concepts your field asks for (that matter), how
  // many do you have — matched by normalized name, deduped so one concept can't
  // be double-counted against you.
  const wantedIdx = groups.map((_, i) => i).filter((i) => common(groups[i].jobs));
  const haveCount = wantedIdx.filter((i) => conceptLvl[i] !== null).length;
  const coveragePct = wantedIdx.length ? Math.round((haveCount / wantedIdx.length) * 100) : null;

  // "Learn this next" — the pull of what you already know. For each gap concept,
  // find the skill you HAVE that it rides along with most: of the postings
  // asking for your skill, what share also ask for the gap. Same in-field
  // postings, pure counting. Floors keep thin pairs honest: your anchor skill
  // must appear in >=5 postings and the pair in >=3 (the cert floor).
  const anchorIdx = new Set(groups.map((_, i) => i).filter((i) => strongAt(i) && conceptJobs[i] >= 5));
  const candIdx = new Set(groups.map((_, i) => i).filter((i) => !strongAt(i) && common(conceptJobs[i])));
  const pairCount = new Map<number, Map<number, number>>(); // gap → (anchor → postings naming both)
  for (const set of jobConcepts.values()) {
    const as: number[] = [], cs: number[] = [];
    for (const g of set) { if (anchorIdx.has(g)) as.push(g); if (candIdx.has(g)) cs.push(g); }
    for (const c of cs) {
      let m = pairCount.get(c);
      if (!m) pairCount.set(c, (m = new Map()));
      for (const a of as) m.set(a, (m.get(a) ?? 0) + 1);
    }
  }
  const nextSkills: NextSkill[] = [...pairCount.entries()]
    .map(([c, m]) => {
      let best: { a: number; n: number; pct: number } | null = null;
      for (const [a, n] of m) {
        if (n < 3) continue;
        const pct = n / conceptJobs[a];
        if (!best || pct > best.pct) best = { a, n, pct };
      }
      return best
        ? { skill: groups[c].name, withSkill: groups[best.a].name, pairJobs: best.n, pairPct: Math.round(best.pct * 100) }
        : null;
    })
    .filter((x): x is NextSkill => x !== null)
    .sort((a, b) => b.pairPct - a.pairPct || b.pairJobs - a.pairJobs)
    .slice(0, 3);

  // Per-job metadata in one fetch: seniority powers the mirror and the ladder
  // (which need to know WHICH postings sit at which level, not just counts),
  // postedAt powers the momentum lens.
  const jobMeta = await prisma.job.findMany({ where: { id: { in: ids } }, select: { id: true, seniority: true, postedAt: true } });

  // Seniority fit, from the enum every posting carries.
  let seniority: ProfileInsights["seniority"] = null;
  let ladder: ProfileInsights["ladder"] = null;
  if (profile.seniority) {
    const myRank = SENIORITY_RANK[profile.seniority] ?? 0;
    const jobSen = jobMeta;
    let atOrAbove = 0, below = 0;
    for (const j of jobSen) {
      const r = SENIORITY_RANK[j.seniority] ?? 0;
      if (r === 0) continue;
      if (r >= myRank) atOrAbove += 1; else below += 1;
    }
    seniority = { level: profile.seniority, atOrAbove, below };

    // The ladder: what the next level's postings name that yours don't — the
    // promotion diff, counted from the same in-field postings. Only shown when
    // both bands hold enough postings for the shares to mean something ("17% of
    // senior postings" needs a real denominator), and a step needs >=3
    // next-level postings (the cert floor) plus a real share jump.
    const BY_RANK = ["", "INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC"];
    const to = myRank >= 1 && myRank < 6 ? BY_RANK[myRank + 1] : null;
    if (to) {
      const atIds: string[] = [], nextIds: string[] = [];
      for (const j of jobSen) {
        if (j.seniority === profile.seniority) atIds.push(j.id);
        else if (j.seniority === to) nextIds.push(j.id);
      }
      if (nextIds.length >= MEANINGFUL_MIN && atIds.length >= 5) {
        const nextCount = new Array<number>(groups.length).fill(0);
        const atCount = new Array<number>(groups.length).fill(0);
        for (const id of nextIds) for (const g of jobConcepts.get(id) ?? []) nextCount[g]++;
        for (const id of atIds) for (const g of jobConcepts.get(id) ?? []) atCount[g]++;
        const steps: LadderStep[] = groups
          .map((g, i) => ({
            skill: g.name,
            jobs: nextCount[i],
            nextPct: Math.round((nextCount[i] / nextIds.length) * 100),
            yourPct: Math.round((atCount[i] / atIds.length) * 100),
            i,
          }))
          // Roadmap, not trivia: skip what you already strongly cover.
          .filter((s) => s.jobs >= 3 && s.nextPct - s.yourPct >= 5 && !strongAt(s.i))
          .sort((a, b) => (b.nextPct - b.yourPct) - (a.nextPct - a.yourPct))
          .slice(0, 4)
          .map(({ skill, nextPct, yourPct, jobs }) => ({ skill, nextPct, yourPct, jobs }));
        if (steps.length) {
          ladder = { from: profile.seniority, to, atLevelJobs: atIds.length, nextLevelJobs: nextIds.length, steps };
        }
      }
    }
  }

  // Certs named in your field's postings — counted, not recommended. One query
  // per pattern, run in parallel: sequential round-trips made this the slowest
  // part of the endpoint.
  const certCounts = await Promise.all(
    CERT_PATTERNS.map((c) =>
      prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM "Job" WHERE id = ANY($1::text[]) AND "descriptionRaw" ~* $2`,
        ids, c.rx
      ).then((rows) => ({ label: c.label, jobs: rows[0].n }))
    )
  );
  const certs = certCounts.filter((c) => c.jobs >= 3).sort((a, b) => b.jobs - a.jobs);

  // Field momentum — what a snapshot can honestly say: how fresh the live
  // inventory is, from the dates the postings themselves declare. What it
  // can't: growth ("added this week" from a fresh ingest is an artifact of us
  // arriving, not the market moving — every firstSeenAt is ingestion week) and
  // lifetimes (no observed expirations yet). Those two unlock behind history
  // gates below and stay null until the data can back them.
  let momentum: Momentum | null = null;
  {
    const now = Date.now();
    const DAY = 86_400_000;
    const ages = jobMeta
      .filter((j) => j.postedAt)
      .map((j) => Math.max(0, (now - j.postedAt!.getTime()) / DAY))
      .sort((a, b) => a - b);
    if (ages.length >= 5) {
      const corpusRow = await prisma.$queryRawUnsafe<{ p50: number | null }[]>(
        `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - "postedAt")) / 86400) AS p50
         FROM "Job" WHERE status = 'LIVE' AND "postedAt" IS NOT NULL`
      );

      // History gates: weekly-added needs >=3 weeks of us actually watching
      // (min firstSeenAt older than 21 days), lifetimes need >=20 in-field
      // postings we've SEEN expire. Until then: null, never an estimate.
      let weeklyAdded: Momentum["weeklyAdded"] = null;
      let medianLifetimeDays: number | null = null;
      if (fieldWhere) {
        const oldest = await prisma.job.aggregate({ _min: { firstSeenAt: true } });
        if (oldest._min.firstSeenAt && now - oldest._min.firstSeenAt.getTime() >= 21 * DAY) {
          const rows = await prisma.job.findMany({
            where: { ...fieldWhere, status: { not: "DUPLICATE" }, firstSeenAt: { gte: new Date(now - 28 * DAY) } },
            select: { firstSeenAt: true },
          });
          const byWeek = new Map<string, number>();
          for (const r of rows) {
            const d = new Date(r.firstSeenAt);
            d.setUTCHours(0, 0, 0, 0);
            d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // sunday-start weeks
            const k = d.toISOString().slice(0, 10);
            byWeek.set(k, (byWeek.get(k) ?? 0) + 1);
          }
          weeklyAdded = [...byWeek.entries()].sort().map(([weekStart, n]) => ({ weekStart, n }));
        }
        const expired = await prisma.job.findMany({
          where: { ...fieldWhere, status: "EXPIRED" },
          select: { firstSeenAt: true, updatedAt: true },
        });
        if (expired.length >= 20) {
          const lives = expired
            .map((e) => (e.updatedAt.getTime() - e.firstSeenAt.getTime()) / DAY)
            .sort((a, b) => a - b);
          medianLifetimeDays = Math.round(lives[Math.floor(lives.length / 2)]);
        }
      }

      momentum = {
        fresh7: ages.filter((a) => a <= 7).length,
        fresh30: ages.filter((a) => a <= 30).length,
        dated: ages.length,
        medianAgeDays: Math.round(ages[Math.floor(ages.length / 2)]),
        corpusMedianAgeDays: corpusRow[0]?.p50 != null ? Math.round(Number(corpusRow[0].p50)) : null,
        ageMix: {
          under1w: ages.filter((a) => a <= 7).length,
          w1to4: ages.filter((a) => a > 7 && a <= 28).length,
          over4w: ages.filter((a) => a > 28).length,
        },
        weeklyAdded,
        medianLifetimeDays,
      };
    }
  }

  return {
    fieldLabel,
    targetJobs: ids.length,
    seniority,
    coveragePct,
    skillGaps: gaps,
    nextSkills,
    momentum,
    ladder,
    certs: certs.slice(0, 4),
    premiumFrom: 2, // first 2 gaps free (the diagnosis); the rest is premium later
    inferred,
    reliable: ids.length >= MEANINGFUL_MIN && gaps.length > 0,
  };
}
