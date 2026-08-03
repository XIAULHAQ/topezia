/**
 * The business plans with their LIVE Stripe amounts.
 *
 * Shared by the public pricing page and the employer billing panel so the
 * two can never disagree. Lives here rather than in a route file because a
 * Next route module may only export handlers.
 *
 * "For sale" means Stripe returned a live price — not merely that an env var
 * is set. A mistyped price id therefore shows as not-for-sale, which is the
 * honest outcome, rather than a button that fails at checkout.
 */
import { getPrices, formatPrice } from "./stripe";
import { PLANS, PAID_PLANS, priceIdFor, pricedPlans } from "./plans";

export type PlanCard = (typeof PLANS)["PRO"] & {
  forSale: boolean;
  monthly: { amount: number; label: string } | null;
  yearly: { amount: number; label: string } | null;
};

export async function planCatalogue(): Promise<PlanCard[]> {
  /**
   * pricedPlans, not sellablePlans: a coming-soon plan still has to show its
   * REAL price, read from Stripe like every other amount. Quoting it from a
   * constant here is how a pricing page ends up disagreeing with the invoice.
   */
  const ids = pricedPlans().flatMap((p) =>
    (["month", "year"] as const).flatMap((period) => {
      const id = priceIdFor(p, period);
      return id ? [id] : [];
    })
  );
  const prices = await getPrices(ids);

  // PAID_PLANS drives the order too, so the cards read Pro → Brand → Studio.
  return PAID_PLANS.map((id) => {
    const monthId = priceIdFor(id, "month");
    const yearId = priceIdFor(id, "year");
    const month = monthId ? prices[monthId] : undefined;
    const year = yearId ? prices[yearId] : undefined;
    return {
      ...PLANS[id],
      // A live Stripe price is necessary but no longer sufficient: a plan we
      // cannot deliver yet is shown, priced, and deliberately unbuyable.
      forSale: Boolean(month || year) && !PLANS[id].comingSoon,
      monthly: month ? { amount: month.amount, label: formatPrice(month) } : null,
      yearly: year ? { amount: year.amount, label: formatPrice(year) } : null,
    };
  });
}
