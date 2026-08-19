/**
 * Skill hubs — pages for work that spans jobs AND freelance projects.
 *
 * WHY THIS EXISTS SEPARATELY FROM ROLES
 *
 * The role lattice in pages.ts is driven by the taxonomy: a page exists because
 * ingestion classified N listings into a Role. That works for settled job
 * titles, and it does not work here, for two reasons.
 *
 *  1. Freelance projects have NO role classification at all (0 of 115 live
 *     projects carry a roleId), and every role-page query filters kind:"JOB"
 *     anyway. The entire project inventory is invisible to the taxonomy.
 *  2. Emerging crafts don't have stable titles yet. "AI video" work is posted
 *     as motion design, video editing, UGC, promo edits and short-form — a
 *     single Role would either miss most of it or become a junk drawer.
 *
 * So a hub is defined by explicit, reviewable matching rules instead, and spans
 * both kinds. Video & Motion is the proof: 4 live jobs is BELOW the publishing
 * floor, but 4 jobs + 9 projects clears it. The page only exists because it
 * combines them.
 *
 * MATCHING RULES — read before editing TERMS
 *
 * Title and exclusion patterns are applied with Postgres `~*` and \y word
 * boundaries. Body terms are applied as full-text PHRASES against
 * Job.descriptionTsv (migration 084) — whole-word matching is built in, and
 * each term is translated by termToTsquery() below, which accepts only plain
 * words, `[- ]` and a trailing `\w*` and throws on anything else, so a rule
 * edit that FTS cannot express fails loudly instead of matching differently.
 * The word-boundary rule is not decoration. A plain `contains` search for "kling" (the AI video tool)
 * matched 139 job descriptions because "tackling" contains it, which made a
 * CDL truck driver look like an AI video specialist. Substring matching on
 * short brand names is unusable here.
 *
 * The rules are deliberately asymmetric between jobs and projects:
 *
 *  - A JOB must match on TITLE. Job descriptions list every tool the team
 *    touches, so body matching pulled in "Developer Relations" and "Staff
 *    Visual Designer" because their stack sections mention After Effects.
 *  - A PROJECT may match on body too. Freelancer.com titles are terse
 *    ("Quick Video Edit") and the brief carries the detail.
 *
 * Exclusions carry real weight: building the video PLATFORM is not doing video
 * work. Without excludeTitle, Roblox's "Principal Software Engineer - Video"
 * and Twilio's "Video Signalling" engineer ranked at the top of a page meant
 * for motion designers.
 */
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export type SkillHub = {
  slug: string;
  name: string;
  heading: string;
  /** Fallback intro. A cached LLM intro overrides it, as with every other page. */
  blurb: string;
  /** Craft named in the TITLE. Broad is fine — a title is a strong signal. */
  title: string[];
  /** Tool/technique names specific enough that an unrelated post won't list them. */
  body: string[];
  /** Title patterns that disqualify outright. */
  excludeTitle: string[];
  /** Body patterns that disqualify outright. */
  excludeBody: string[];
};

/**
 * Patterns are REGEX FRAGMENTS, not literals — `videograph\w*` and `[- ]` are
 * intentional. They are authored here, never user input, so they are not
 * escaped. Anything derived from a request must never reach these arrays.
 */
export const HUBS: SkillHub[] = [
  {
    slug: "video-motion",
    name: "Video & Motion",
    heading: "Video & motion design jobs and freelance projects",
    blurb:
      "Video editing, motion graphics, animation and AI-assisted video work — salaried roles and freelance briefs in one place. Jobs come straight from company career pages; projects are live client briefs you bid on directly. Topezia scores both against your actual experience, honestly, including the weak fits.",
    title: [
      "video", "videograph\\w*", "motion graphics", "motion design\\w*",
      "animator", "animation", "reels", "short[- ]form", "vfx", "post[- ]production",
    ],
    body: [
      "after effects", "premiere pro", "davinci resolve", "capcut", "final cut pro",
      "motion graphics", "heygen", "synthesia", "runwayml", "sora", "kling ai",
      "pika labs", "luma ai", "ai[- ]generated video", "generative video",
      "text[- ]to[- ]video", "ai avatar", "ugc video", "explainer video",
    ],
    excludeTitle: [
      "software engineer", "engineering manager", "principal engineer",
      "staff engineer", "qa engineer", "backend", "platform engineer",
      "data engineer", "devops",
    ],
    excludeBody: [
      "video codec", "webrtc", "video signalling", "video signaling",
      "video infrastructure", "video pipeline", "streaming infrastructure",
    ],
  },
];

export const hubBySlug = (slug: string): SkillHub | null =>
  HUBS.find((h) => h.slug === slug.toLowerCase()) ?? null;

const group = (terms: string[]) => `\\y(${terms.join("|")})\\y`;

/**
 * Body term (authored regex fragment) → tsquery. Supported: words, spaces,
 * `[- ]` (hyphen-or-space, becomes a phrase step — the parser splits
 * hyphenated words into parts at consecutive positions, so `ai <-> generated`
 * matches both "ai generated" and "ai-generated"), trailing `\w*` (prefix
 * match). Anything else throws: see MATCHING RULES above.
 */
export function termToTsquery(term: string): string {
  const words = term.split(/\[- \]| /).map((w) => {
    if (/^[a-z0-9]+$/i.test(w)) return w.toLowerCase();
    if (/^[a-z0-9]+\\w\*$/i.test(w)) return `${w.slice(0, -3).toLowerCase()}:*`;
    throw new Error(`hub body term is not FTS-translatable: "${term}" (at "${w}") — see lib/seo/hubs.ts MATCHING RULES`);
  });
  return words.length === 1 ? words[0] : `(${words.join(" <-> ")})`;
}
const bodyQuery = (terms: string[]) => terms.map(termToTsquery).join(" | ");

/**
 * Ids only. The caller re-reads full rows through the normal select so hub
 * cards carry exactly the same fields as every other listing card.
 *
 * PERFORMANCE — read before editing the SQL. This was the most expensive
 * query in the app (pg_stat_statements mean 891 ms). Live-DB measurements,
 * 2026-08-19, 7.5k live projects / 17.7k live jobs:
 *
 *  - Jobs enter only via the title regex, which job_title_trgm_idx narrows
 *    to ~3k candidates before the regex runs on short strings (27 survive).
 *    The old form ran three title regexes over all 26k rows: 348 ms.
 *  - Projects enter via the title regex OR a full-text phrase match on
 *    descriptionTsv (GIN, partial on kind = 'PROJECT'). The old form ran the
 *    body regex over every project brief: ~400 ms, and pg_trgm could not
 *    index it (every multi-term alternation form returned most projects and
 *    rechecked them with the regex). FTS is ~10 ms and, with the slash
 *    normalisation in the trigger, a strict superset of the regex on live
 *    data: 806 → 814, the 8 extra being "motion-graphics"-style hyphenations
 *    and "UGC/video" that the regex rule's literal space missed.
 *  - Exclusions stay regex and run only on the ~1.2k survivors.
 *
 * MATERIALIZED is load-bearing: without it the planner inlines the CTE and
 * re-evaluates the regexes per output row.
 *
 * Predicate:
 *   LIVE ∧ ¬(title~exT) ∧ ¬(title~exB) ∧ ¬(desc~exB)
 *        ∧ (title~T ∨ (PROJECT ∧ tsv @@ B))
 */
async function computeHubMatchIds(slug: string): Promise<{ jobIds: string[]; projectIds: string[] }> {
  const hub = hubBySlug(slug);
  if (!hub) return { jobIds: [], projectIds: [] };
  const rows = await prisma.$queryRawUnsafe<{ id: string; kind: string }[]>(
    `WITH cand AS MATERIALIZED (
       SELECT j.id, j.kind, j."titleRaw", j."descriptionRaw", j."lastVerifiedAt", true AS title_hit
         FROM "Job" j
        WHERE j.status = 'LIVE' AND j.kind = 'JOB' AND j."titleRaw" ~* $1
       UNION ALL
       SELECT j.id, j.kind, j."titleRaw", j."descriptionRaw", j."lastVerifiedAt", (j."titleRaw" ~* $1) AS title_hit
         FROM "Job" j
        WHERE j.status = 'LIVE' AND j.kind = 'PROJECT'
          AND ( j."titleRaw" ~* $1 OR j."descriptionTsv" @@ to_tsquery('simple', $2) )
     )
     SELECT id, kind::text AS kind
       FROM cand
      WHERE NOT ("titleRaw" ~* $3)
        AND NOT ("titleRaw" ~* $4)
        AND NOT ("descriptionRaw" ~* $4)
      ORDER BY title_hit DESC, "lastVerifiedAt" DESC
      LIMIT 200`,
    group(hub.title),
    bodyQuery(hub.body),
    group(hub.excludeTitle),
    group(hub.excludeBody),
  );

  return {
    jobIds: rows.filter((r) => r.kind === "JOB").map((r) => r.id),
    projectIds: rows.filter((r) => r.kind === "PROJECT").map((r) => r.id),
  };
}

/**
 * Cross-request cache, same discipline as cachedBrowseHub in pages.ts. Keyed
 * by slug (unstable_cache args must be serialisable; the rules are looked up
 * inside). One hour: hub pages themselves revalidate hourly, ingestion runs
 * twice a day, and the Next data cache serves stale-while-revalidating, so a
 * visitor never waits on the regex pass once the entry exists.
 */
const cachedHubMatchIds = unstable_cache(computeHubMatchIds, ["hub-match-ids-v1"], {
  revalidate: 3600,
  tags: ["browse-hub"],
});

export async function hubMatchIds(hub: SkillHub): Promise<{ jobIds: string[]; projectIds: string[] }> {
  try {
    return await cachedHubMatchIds(hub.slug);
  } catch (err) {
    // Outside a Next request (scripts/generate-page-intros.ts imports this via
    // pages.ts) unstable_cache throws "Invariant: incrementalCache missing".
    // Degrade to the direct query there; any real DB error surfaces from it.
    if (err instanceof Error && /incrementalCache/.test(err.message)) return computeHubMatchIds(hub.slug);
    throw err;
  }
}
