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
import { PLANS, priceIdFor, sellablePlans } from "./plans";

export type PlanCard = (typeof PLANS)["PRO"] & {
  forSale: boolean;
  monthly: { amount: number; label: string } | null;
  yearly: { amount: number; label: string } | null;
};

export async function planCatalogue(): Promise<PlanCard[]> {
  const ids = sellablePlans().flatMap((p) =>
    (["month", "year"] as const).flatMap((period) => {
      const id = priceIdFor(p, period);
      return id ? [id] : [];
    })
  );
  const prices = await getPrices(ids);

  return (["PRO", "STUDIO"] as const).map((id) => {
    const monthId = priceIdFor(id, "month");
    const yearId = priceIdFor(id, "year");
    const month = monthId ? prices[monthId] : undefined;
    const year = yearId ? prices[yearId] : undefined;
    return {
      ...PLANS[id],
      forSale: Boolean(month || year),
      monthly: month ? { amount: month.amount, label: formatPrice(month) } : null,
      yearly: year ? { amount: year.amount, label: formatPrice(year) } : null,
    };
  });
}
