/**
 * Turning a saved posting into a live one.
 *
 * Why this exists separately from POST /api/postings: a DRAFT deliberately
 * skips the expensive enrichment (Claude extraction + Voyage embedding). Two
 * reasons, and the second matters more than the cost:
 *
 *  1. A draft may be saved several times while it's being written, and each
 *     save would otherwise spend a real LLM call and an embedding call.
 *  2. Enriching half-written text produces junk. If we extracted seniority
 *     and skills from a 40-character stub, that junk would be what the
 *     matcher later ranks the posting on — the draft would publish already
 *     poisoned. Running enrichment at PUBLISH time means the model always
 *     sees the finished posting.
 *
 * So a draft is a plain row with the employer's own typed fields, and this
 * module is the single place that enforces the publish bar and then runs the
 * exact same pipeline a crawled job gets.
 */
import { prisma } from "@/lib/prisma";
import { hashDescription } from "@/lib/ingestion/llm-extract";
import { enrichInBackground } from "@/lib/employer/enrich";

const UNSORTED = "unsorted";

/** The bar a posting must clear to go live. Mirrored as a live checklist in
 *  the post form, and re-checked here so publishing a draft can't sneak a
 *  thin posting past the rules a direct publish would enforce. */
export const PUBLISH_RULES = {
  titleMin: 8,
  descriptionMin: 200,
  skillsMin: 2,
} as const;

export function publishBlockers(p: { titleRaw: string; descriptionRaw: string; skillCount: number; roleId: string | null }): string[] {
  const out: string[] = [];
  if (p.titleRaw.trim().length < PUBLISH_RULES.titleMin) out.push(`Title needs ${PUBLISH_RULES.titleMin}+ characters.`);
  if (!p.roleId) out.push("Pick a category — it routes the right people to you.");
  if (p.descriptionRaw.trim().length < PUBLISH_RULES.descriptionMin) out.push(`The description needs at least ${PUBLISH_RULES.descriptionMin} characters.`);
  if (p.skillCount < PUBLISH_RULES.skillsMin) out.push(`List at least ${PUBLISH_RULES.skillsMin} required skills.`);
  return out;
}

/**
 * Enrich a DRAFT and flip it live. Returns the blockers instead of publishing
 * when the posting doesn't clear the bar.
 */
export async function publishDraft(jobId: string): Promise<{ ok: true } | { ok: false; blockers: string[] }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true, titleRaw: true, descriptionRaw: true, roleId: true, seniority: true,
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
  if (!job) return { ok: false, blockers: ["Posting not found."] };

  const ownSkills = job.skills.map((s) => s.skill.name);
  const blockers = publishBlockers({
    titleRaw: job.titleRaw,
    descriptionRaw: job.descriptionRaw,
    skillCount: ownSkills.length,
    roleId: job.roleId,
  });
  if (blockers.length) return { ok: false, blockers };

  // The draft's OWN content is what goes live, immediately. The model's
  // extras and the embedding follow after, on the background hand-off — see
  // lib/employer/enrich.ts for why that stopped being part of the request.
  const roleId = job.roleId;
  const role = roleId ? await prisma.role.findUnique({ where: { id: roleId }, select: { verticalId: true } }) : null;
  const verticalId =
    role?.verticalId ??
    (await prisma.vertical.findUnique({ where: { slug: UNSORTED }, select: { id: true } }))!.id;

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "LIVE",
      postedAt: new Date(),
      lastVerifiedAt: new Date(),
      roleId,
      verticalId,
      descriptionHash: hashDescription(`${job.titleRaw}\n${job.descriptionRaw}`),
    },
  });

  // The draft carries whatever seniority the employer chose on the form; only
  // an untouched NOT_APPLICABLE is left for the model to fill.
  enrichInBackground(job.id, { seniorityIsTheirs: job.seniority !== "NOT_APPLICABLE" });

  return { ok: true };
}
