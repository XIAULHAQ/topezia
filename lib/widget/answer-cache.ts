/**
 * The widget's answer cache — Phase 1 §3.2 of docs/ai-cost-strategy.md.
 *
 * Small-business chat repeats itself: "what are your hours", "do you ship
 * to Ireland", "how much is the 3x6 banner". Each repeat used to be a fresh
 * model call. The visitor's first question is already embedded for
 * retrieval, so the answer is kept next to that embedding for a day, and
 * the next visitor who asks the same thing (cosine distance under
 * DISTANCE) gets it with no model in the loop.
 *
 * WHAT IS CACHED — only what a model actually produced for a FIRST-TURN
 * question with nothing else in play: no order lookup, no contact capture,
 * no follow-up context. Later turns embed the previous exchange, so "same
 * embedding" stops meaning "same question"; and the reply for a captured
 * lead or a looked-up order is about that person, not the question.
 *
 * WHEN IT IS WRONG — the answer's sources changed. Two things change them:
 * a recrawl (pages, products, prices) and a taught-fact write (the owner
 * corrected the bot). Both call invalidate() for the whole brand, so a stale
 * answer can outlive its source by at most the TTL, and never past a fix
 * the owner just made.
 *
 * THE PAGE — the prompt tells the model which page the visitor is on and
 * puts that page's product on the shelf. When the reply used any product
 * (cards came back, or a page product existed) it is marked pageSensitive
 * and only reused on the same page; an answer with no product in it is
 * reused site-wide, which is what makes the cache useful on a 200-page
 * site where "how do I contact you" is asked from everywhere.
 *
 * Brand-scoped, like retrieval (migration 070): sibling domains share one
 * knowledge boundary, so they share one cache.
 */
import { prisma } from "@/lib/prisma";
import type { ProductCard, WidgetAnswer } from "./answer";
import { brandSiteIds } from "./brand";

/** Cosine distance under which two first questions are "the same". Voyage
 *  puts light paraphrases at 0.03–0.07; 0.08 is the strategy's starting
 *  point. Tunable without a deploy. */
export function cacheDistance(): number {
  const n = Number(process.env.WIDGET_ANSWER_CACHE_DISTANCE);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.08;
}

const TTL_MS = 24 * 60 * 60 * 1000;

type CachedRow = {
  id: string;
  reply: string;
  sources: unknown;
  products: unknown;
  handoff: boolean;
  distance: number;
};

/**
 * The nearest fresh answer for this brand — same page if the answer leaned
 * on one, any page otherwise. Null on a miss, and null on any error: the
 * cache is a saving, never a dependency.
 */
export async function lookupCachedAnswer(
  siteIds: string[],
  qVector: string,
  pageUrl: string | null
): Promise<WidgetAnswer | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<CachedRow[]>(
      `SELECT id, reply, sources, products, handoff, (embedding <=> $1::vector) AS distance
         FROM "WidgetAnswerCache"
        WHERE "siteId" = ANY($2::text[])
          AND "expiresAt" > NOW()
          AND embedding IS NOT NULL
          AND (NOT "pageSensitive" OR "pageUrl" IS NOT DISTINCT FROM $3)
        ORDER BY embedding <=> $1::vector
        LIMIT 1`,
      qVector,
      siteIds,
      pageUrl
    );
    const hit = rows[0];
    if (!hit || !(hit.distance < cacheDistance())) return null;

    // Telemetry only — never awaited into the reply's latency.
    prisma.widgetAnswerCache
      .update({ where: { id: hit.id }, data: { hits: { increment: 1 } } })
      .catch(() => { /* a miscount, not a problem */ });

    return {
      reply: hit.reply,
      sources: Array.isArray(hit.sources) ? (hit.sources as string[]) : [],
      products: Array.isArray(hit.products) ? (hit.products as ProductCard[]) : [],
      handoff: hit.handoff,
    };
  } catch (err) {
    console.error("[widget/cache] lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Keep an answer the model just wrote. Fire-and-forget from the caller's
 * point of view (the visitor already has the reply); the row and its vector
 * are written in one round trip each. Expired rows for the same site are
 * swept on the way, which keeps the table at "yesterday's questions".
 */
export async function storeCachedAnswer(args: {
  siteId: string;
  question: string;
  qVector: string;
  pageUrl: string | null;
  pageSensitive: boolean;
  answer: WidgetAnswer;
}): Promise<void> {
  try {
    const row = await prisma.widgetAnswerCache.create({
      data: {
        siteId: args.siteId,
        pageUrl: args.pageUrl,
        pageSensitive: args.pageSensitive,
        question: args.question.slice(0, 1000),
        reply: args.answer.reply,
        sources: args.answer.sources,
        products: args.answer.products as unknown as object[],
        handoff: args.answer.handoff,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
      select: { id: true },
    });
    await prisma.$executeRawUnsafe(`UPDATE "WidgetAnswerCache" SET embedding = $1::vector WHERE id = $2`, args.qVector, row.id);
    await prisma.widgetAnswerCache.deleteMany({ where: { siteId: args.siteId, expiresAt: { lt: new Date() } } });
  } catch (err) {
    console.error("[widget/cache] store failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * The sources changed — forget everything answered from them. Called after
 * a recrawl and after any taught-fact write, with the whole brand's site
 * ids, because an answer on one sibling may have drawn on another.
 */
export async function invalidateAnswerCache(siteIds: string[]): Promise<void> {
  if (!siteIds.length) return;
  try {
    await prisma.widgetAnswerCache.deleteMany({ where: { siteId: { in: siteIds } } });
  } catch (err) {
    console.error("[widget/cache] invalidate failed:", err instanceof Error ? err.message : err);
  }
}

/** Same, from one site id: resolves the brand first (a sibling's cache may
 *  hold answers drawn from this site's pages). Never throws. */
export async function invalidateAnswerCacheForSite(siteId: string): Promise<void> {
  try {
    const site = await prisma.widgetSite.findUnique({ where: { id: siteId }, select: { id: true, brandId: true } });
    if (!site) return;
    await invalidateAnswerCache(await brandSiteIds(site));
  } catch (err) {
    console.error("[widget/cache] invalidate failed:", err instanceof Error ? err.message : err);
  }
}
