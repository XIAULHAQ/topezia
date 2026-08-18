/**
 * Teach the bot: answers the owner writes by hand.
 *
 * A SiteFact is a question the assistant got wrong (or couldn't answer at
 * all) plus the answer its owner wants given instead. Facts are embedded
 * like site chunks and retrieved the same way, but the prompt ranks them
 * ABOVE the crawl — a human correcting the assistant outranks whatever the
 * page happened to say.
 *
 * The load-bearing property is durability: crawls wipe SiteChunk and
 * SiteProduct every time they run, and facts must survive that, or "fix it
 * once" quietly becomes "fix it after every scan". Nothing in this file (or
 * in crawl.ts) may ever delete facts as part of a crawl.
 */
import { prisma } from "@/lib/prisma";
import { invalidateAnswerCacheForSite } from "./answer-cache";
import { embedText } from "@/lib/ingestion/embed";
import { planFor } from "@/lib/billing/plans";

export const FACT_LIMITS = {
  question: 200,
  answer: 900,
};

/** How many answers this site's plan allows. */
export async function factCap(siteId: string): Promise<number> {
  const site = await prisma.widgetSite.findUnique({
    where: { id: siteId },
    select: { company: { select: { plan: true } } },
  });
  return planFor(site?.company).facts;
}

export type Fact = { id: string; question: string; answer: string; updatedAt: Date };

/**
 * Create or update a taught answer. Returns null when the site is at its
 * fact ceiling. The embedding is written raw (pgvector), and a fact whose
 * embedding fails still saves — it just won't be retrieved until it's
 * edited again, which is better than losing the owner's typing.
 */
export async function saveFact(
  siteId: string,
  input: { id?: string; question: string; answer: string }
): Promise<Fact | null> {
  const question = input.question.replace(/\s+/g, " ").trim().slice(0, FACT_LIMITS.question);
  const answer = input.answer.replace(/\r\n/g, "\n").trim().slice(0, FACT_LIMITS.answer);
  if (!question || !answer) return null;

  let fact: Fact;
  if (input.id) {
    // The where IS the authorization — another site's fact id reads as absent.
    const owned = await prisma.siteFact.findFirst({ where: { id: input.id, siteId }, select: { id: true } });
    if (!owned) return null;
    fact = await prisma.siteFact.update({
      where: { id: owned.id },
      data: { question, answer, updatedAt: new Date() },
      select: { id: true, question: true, answer: true, updatedAt: true },
    });
  } else {
    if ((await prisma.siteFact.count({ where: { siteId } })) >= (await factCap(siteId))) return null;
    fact = await prisma.siteFact.create({
      data: { siteId, question, answer },
      select: { id: true, question: true, answer: true, updatedAt: true },
    });
  }

  const embedding = await embedText(`${question}\n${answer}`);
  if (embedding) {
    await prisma.$executeRawUnsafe(
      `UPDATE "SiteFact" SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      fact.id
    );
  }
  // The owner just corrected the bot: nothing answered before this may be
  // served again, or the correction doesn't stick for up to a day.
  await invalidateAnswerCacheForSite(siteId);
  return fact;
}

export async function listFacts(siteId: string): Promise<Fact[]> {
  return prisma.siteFact.findMany({
    where: { siteId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, question: true, answer: true, updatedAt: true },
  });
}

export async function deleteFact(siteId: string, id: string): Promise<boolean> {
  const { count } = await prisma.siteFact.deleteMany({ where: { id, siteId } });
  if (count > 0) await invalidateAnswerCacheForSite(siteId);
  return count > 0;
}

/**
 * The questions worth teaching: what visitors asked that the bot could NOT
 * answer, most recent first, near-duplicates collapsed. This is the digest's
 * content-gap list made actionable.
 */
export async function unansweredQuestions(siteId: string, limit = 12): Promise<{ question: string; count: number }[]> {
  const rows = await prisma.widgetQuestion.findMany({
    where: { siteId, answered: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { question: true },
  });

  const byKey = new Map<string, { question: string; count: number }>();
  for (const r of rows) {
    const key = r.question.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const hit = byKey.get(key);
    if (hit) hit.count++;
    else byKey.set(key, { question: r.question, count: 1 });
  }
  return [...byKey.values()].slice(0, limit);
}
