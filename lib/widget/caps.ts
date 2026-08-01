/**
 * The free tier's shape, in one place.
 *
 * The cap that matters is AI replies per month — that's the line item that
 * costs money per unit. When it's spent, the widget does NOT go dark: it
 * stops calling the model and pivots every question to "leave a message",
 * because capping the lead flow would punish the company for being popular,
 * which is backwards. Paid tiers (not built yet — no employer billing
 * surface) raise these numbers; they must never gate the human handoff.
 */
import { prisma } from "@/lib/prisma";

export const FREE_LIMITS = {
  sites: 1, // enforced by WidgetSite.companyId being unique
  // Per crawl. 60, not 40: a store's product pages are thin and numerous —
  // on the pilot they'd have eaten most of a 40-page budget and starved the
  // service/about pages the Q&A answers actually come from.
  pages: 60,
  aiRepliesPerMonth: 200,
};

const monthKey = () => new Date().toISOString().slice(0, 7); // "2026-08"

/**
 * Spend one AI reply from the site's monthly budget. True = model call
 * allowed; false = budget spent, degrade to message capture. The month rolls
 * over by comparison — no cron resets a counter, and the conditional UPDATE
 * makes concurrent spends safe.
 */
export async function consumeAiReply(siteId: string): Promise<boolean> {
  const mk = monthKey();
  const spent = await prisma.widgetSite.updateMany({
    where: { id: siteId, monthKey: mk, messagesUsed: { lt: FREE_LIMITS.aiRepliesPerMonth } },
    data: { messagesUsed: { increment: 1 } },
  });
  if (spent.count === 1) return true;

  // Either a new month (reset and spend 1) or the budget is gone.
  const reset = await prisma.widgetSite.updateMany({
    where: { id: siteId, monthKey: { not: mk } },
    data: { monthKey: mk, messagesUsed: 1 },
  });
  return reset.count === 1;
}

/** Read-only view for the employer page. */
export async function usageThisMonth(site: { monthKey: string; messagesUsed: number }): Promise<{ used: number; limit: number }> {
  return {
    used: site.monthKey === monthKey() ? site.messagesUsed : 0,
    limit: FREE_LIMITS.aiRepliesPerMonth,
  };
}
