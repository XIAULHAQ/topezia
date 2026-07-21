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
 * Every pattern is applied with Postgres `~*` and \y word boundaries. This is
 * not decoration. A plain `contains` search for "kling" (the AI video tool)
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
 * Ids only. The caller re-reads full rows through the normal select so hub
 * cards carry exactly the same fields as every other listing card.
 */
export async function hubMatchIds(hub: SkillHub): Promise<{ jobIds: string[]; projectIds: string[] }> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; kind: string }[]>(
    `SELECT j.id, j.kind::text AS kind
       FROM "Job" j
      WHERE j.status = 'LIVE'
        AND NOT (j."titleRaw" ~* $3)
        AND NOT (j."titleRaw" ~* $4 OR j."descriptionRaw" ~* $4)
        AND ( j."titleRaw" ~* $1
              OR (j.kind = 'PROJECT' AND j."descriptionRaw" ~* $2) )
      ORDER BY (j."titleRaw" ~* $1) DESC, j."lastVerifiedAt" DESC
      LIMIT 200`,
    group(hub.title),
    group(hub.body),
    group(hub.excludeTitle),
    group(hub.excludeBody),
  );

  return {
    jobIds: rows.filter((r) => r.kind === "JOB").map((r) => r.id),
    projectIds: rows.filter((r) => r.kind === "PROJECT").map((r) => r.id),
  };
}
