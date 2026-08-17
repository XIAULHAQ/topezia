/**
 * Enrichment for a posting an employer TYPED — run after it is already live.
 *
 * A crawled job needs the model: all we have is scraped text, so the role,
 * the skills and the seniority have to be recovered from it. A native posting
 * is the opposite case — the employer picked the category, listed the skills
 * and (since this module) chose the seniority, so the model is only ever
 * adding to a posting that is already complete. It used to run INSIDE the
 * publish request anyway, inherited wholesale from the crawler pipeline, with
 * two consequences:
 *
 *   1. An Anthropic outage or an empty credit balance took the posting down
 *      with it. That happened, and cost a real employer their posting.
 *   2. Publishing waited on a model call — seconds of latency for something
 *      that changes nothing the employer can see.
 *
 * So the posting goes live from what they typed, and this runs afterwards on
 * the platform's waitUntil (the response is already sent). Nothing here can
 * un-publish a job; every step is independently best-effort, and a job that
 * misses its embedding is picked up by scripts/backfill-embeddings.ts.
 *
 * THE EMPLOYER ALWAYS WINS. This only ever fills gaps: it adds skills they
 * didn't list, and sets seniority ONLY when they didn't answer. It never
 * overwrites an answer with a guess.
 */
import { prisma } from "@/lib/prisma";
import { extractWithLlm } from "@/lib/ingestion/llm-extract";
import { resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";

const UNSORTED = "unsorted";

export type EnrichOptions = {
  /** True when the employer chose a seniority themselves — then it is theirs,
   *  and the model's guess is discarded. */
  seniorityIsTheirs: boolean;
};

export async function enrichNativePosting(jobId: string, opts: EnrichOptions): Promise<void> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true, titleRaw: true, descriptionRaw: true, status: true, verticalId: true,
        skills: { select: { skill: { select: { name: true } } } },
      },
    });
    // Nothing to enrich if it vanished or was closed in the meantime.
    if (!job || job.status !== "LIVE") return;

    const ownSkills = job.skills.map((s) => s.skill.name);

    // ── the model's contribution, entirely optional ──────────────────────
    let llm: Awaited<ReturnType<typeof extractWithLlm>> | null = null;
    try {
      llm = await extractWithLlm(job.titleRaw, job.descriptionRaw);
    } catch (err) {
      // Reaches the error log (lib/errors/log.ts) so an unenriched posting is
      // visible at the weekly review rather than silently mediocre.
      console.error("[enrich] model unavailable, posting stays as written:", err instanceof Error ? err.message : err);
    }

    if (llm) {
      const extra = llm.skills.filter((s) => !ownSkills.some((o) => o.toLowerCase() === s.toLowerCase()));
      const data: Record<string, unknown> = {};
      if (llm.roleGuess) data.titleNormalized = llm.roleGuess;
      if (!opts.seniorityIsTheirs && llm.seniority) data.seniority = llm.seniority;

      // Only ever RESCUE the vertical: a posting that landed in "unsorted"
      // because its role didn't resolve is the one case the guess helps.
      if (llm.vertical) {
        const unsorted = await prisma.vertical.findUnique({ where: { slug: UNSORTED }, select: { id: true } });
        if (unsorted && job.verticalId === unsorted.id) {
          const guessed = await prisma.vertical.findUnique({ where: { slug: llm.vertical }, select: { id: true } });
          if (guessed) data.verticalId = guessed.id;
        }
      }

      if (extra.length) {
        // createMany + skipDuplicates rather than a delete/recreate: the
        // employer's own rows must survive, and a concurrent edit must not
        // race this into deleting them.
        const ids = await resolveSkills(extra);
        if (ids.length) {
          await prisma.jobSkill.createMany({
            data: ids.map((skillId) => ({ jobId: job.id, skillId })),
            skipDuplicates: true,
          });
        }
      }
      if (Object.keys(data).length) await prisma.job.update({ where: { id: job.id }, data });
    }

    // ── the embedding, which is what actually decides retrieval ──────────
    // Voyage, not Anthropic: separate provider, separate billing, so this
    // still runs on a day the model is unreachable.
    try {
      const skillsForEmbedding = [...new Set([...ownSkills, ...(llm?.skills ?? [])])];
      const embedding = await embedText(
        buildJobEmbeddingInput({
          titleNormalized: llm?.roleGuess || null,
          titleRaw: job.titleRaw,
          skills: skillsForEmbedding,
          descriptionText: job.descriptionRaw,
        })
      );
      if (embedding) await writeJobEmbedding(prisma, job.id, embedding);
    } catch (err) {
      console.error("[enrich] embedding failed:", err instanceof Error ? err.message : err);
    }
  } catch (err) {
    // The posting is already live; enrichment failing is never the caller's
    // problem, and this runs after the response has gone out.
    console.error("[enrich] failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Run enrichment without making the caller wait for it.
 *
 * On Vercel the function is frozen the moment the response is sent, so the
 * work has to be handed to waitUntil or it simply never happens — the same
 * trap the error log hit. Everywhere else the promise just runs.
 */
export function enrichInBackground(jobId: string, opts: EnrichOptions): void {
  const work = enrichNativePosting(jobId, opts);
  try {
    if (process.env.VERCEL) {
      void import("@vercel/functions").then((m) => m.waitUntil(work)).catch(() => {});
    }
  } catch {
    /* no platform hook — the promise still runs while the process lives */
  }
  void work.catch(() => {});
}
