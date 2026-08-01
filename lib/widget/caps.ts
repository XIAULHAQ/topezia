/**
 * The monthly AI budget, per plan.
 *
 * The cap that matters is AI replies per month — that's the line item that
 * costs money per unit. When it's spent, the widget does NOT go dark: it
 * stops calling the model and pivots every question to "leave a message",
 * because capping the lead flow would punish the company for being popular,
 * which is backwards. That rule holds on every plan, including free.
 *
 * Two counters, one pattern. Single-site plans spend against the site's own
 * row; multi-site plans spend against the company's, so ten sites share one
 * budget instead of ten drifting ones. Both use a conditional UPDATE whose
 * WHERE carries the limit, which is what makes concurrent spends safe
 * without a transaction — the database refuses the increment that would
 * cross the line. The month rolls over by comparison; no cron resets
 * anything.
 */
import { prisma } from "@/lib/prisma";
import { PLANS, planFor, type PlanLimits } from "@/lib/billing/plans";

/** Kept as the free plan's shape for the callers that predate plans. */
export const FREE_LIMITS = {
  sites: PLANS.FREE.sites,
  pages: PLANS.FREE.pages,
  aiRepliesPerMonth: PLANS.FREE.aiRepliesPerMonth,
};

const monthKey = () => new Date().toISOString().slice(0, 7); // "2026-08"

/**
 * Spend one AI reply from the budget. True = model call allowed; false =
 * budget spent, degrade to message capture.
 */
export async function consumeAiReply(siteId: string): Promise<boolean> {
  const site = await prisma.widgetSite.findUnique({
    where: { id: siteId },
    select: { companyId: true, company: { select: { plan: true } } },
  });
  if (!site) return false;

  const plan = planFor(site.company);
  const limit = plan.aiRepliesPerMonth;
  const mk = monthKey();

  // Two near-identical blocks rather than one generic helper: Prisma's
  // delegates don't share a callable type, and the honest fix is to write
  // the query twice than to cast the client into something it isn't.
  if (plan.sites > 1) {
    const spent = await prisma.company.updateMany({
      where: { id: site.companyId, aiMonthKey: mk, aiRepliesUsed: { lt: limit } },
      data: { aiRepliesUsed: { increment: 1 } },
    });
    if (spent.count === 1) return true;
    const reset = await prisma.company.updateMany({
      where: { id: site.companyId, aiMonthKey: { not: mk } },
      data: { aiMonthKey: mk, aiRepliesUsed: 1 },
    });
    return reset.count === 1;
  }

  const spent = await prisma.widgetSite.updateMany({
    where: { id: siteId, monthKey: mk, messagesUsed: { lt: limit } },
    data: { messagesUsed: { increment: 1 } },
  });
  if (spent.count === 1) return true;
  const reset = await prisma.widgetSite.updateMany({
    where: { id: siteId, monthKey: { not: mk } },
    data: { monthKey: mk, messagesUsed: 1 },
  });
  return reset.count === 1;
}

/**
 * Read-only view for the employer page. Reads whichever counter that
 * company's plan actually spends from, so the number on screen is the
 * number the widget is enforcing.
 */
export async function usageThisMonth(
  site: { monthKey: string; messagesUsed: number },
  company?: { plan?: string | null; aiMonthKey?: string; aiRepliesUsed?: number } | null
): Promise<{ used: number; limit: number; pooled: boolean }> {
  const plan: PlanLimits = planFor(company);
  const mk = monthKey();
  if (plan.sites > 1 && company) {
    return {
      used: company.aiMonthKey === mk ? company.aiRepliesUsed ?? 0 : 0,
      limit: plan.aiRepliesPerMonth,
      pooled: true,
    };
  }
  return {
    used: site.monthKey === mk ? site.messagesUsed : 0,
    limit: plan.aiRepliesPerMonth,
    pooled: false,
  };
}
