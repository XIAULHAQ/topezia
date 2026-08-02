/**
 * A Stripe Billing Portal configuration that belongs to BUSINESS plans only.
 *
 * Why this file exists: the portal configuration edited in the Stripe
 * Dashboard is a single shared default, and member Premium uses it. Turning
 * "customers can switch plans" on there would also offer a $29 member the
 * $39 business price — a different product line entirely, and our member
 * webhook grants PREMIUM for any active subscription regardless of price, so
 * they would keep a membership while paying business money. Companies
 * therefore get their own configuration, and members keep the Dashboard's.
 *
 * It is built FROM THE PRICES THAT ARE ACTUALLY FOR SALE (lib/billing/plans),
 * so it can never offer a plan the product won't honour. Studio is absent
 * until its price IDs are set, which is exactly the state we want while
 * multi-site is unbuilt — and the moment those IDs appear, the fingerprint
 * changes and a fresh configuration is built with Studio included. No manual
 * Dashboard step, in any environment.
 *
 * Created lazily on first use and cached per process. If anything here
 * fails, the caller opens the portal WITHOUT a configuration — the customer
 * still reaches their invoices and card details, which matters more than
 * plan switching.
 */
import type Stripe from "stripe";
import { priceIdFor, type PlanId, type BillingPeriod } from "./plans";

const KIND = "company";

/** Cached per process; the fingerprint invalidates it when prices change. */
let cached: { fingerprint: string; id: string } | null = null;

function businessPriceIds(): string[] {
  const ids: string[] = [];
  for (const plan of ["PRO", "STUDIO"] as Exclude<PlanId, "FREE">[]) {
    for (const period of ["month", "year"] as BillingPeriod[]) {
      const id = priceIdFor(plan, period);
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * The configuration id to use for a company portal session, or null when
 * there is nothing to switch between (no business prices configured) — in
 * which case the default configuration is correct anyway.
 */
export async function companyPortalConfigId(stripe: Stripe): Promise<string | null> {
  const priceIds = businessPriceIds();
  // One price can't be "switched" to anything; let the default handle it.
  if (priceIds.length < 2) return null;

  const fingerprint = [...priceIds].sort().join(",");
  if (cached?.fingerprint === fingerprint) return cached.id;

  // Reuse the one built by another process/deploy for this same price set.
  const existing = await stripe.billingPortal.configurations.list({ limit: 100, active: true });
  const match = existing.data.find(
    (c) => c.metadata?.topezia_kind === KIND && c.metadata?.topezia_prices === fingerprint
  );
  if (match) {
    cached = { fingerprint, id: match.id };
    return match.id;
  }

  // subscription_update needs PRODUCTS, so resolve each price to its parent
  // and group. Derived, never hardcoded: the products follow the prices.
  const prices = await Promise.all(priceIds.map((id) => stripe.prices.retrieve(id)));
  const byProduct = new Map<string, string[]>();
  for (const price of prices) {
    if (!price.active || !price.recurring) continue;
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), price.id]);
  }
  const products = [...byProduct.entries()].map(([product, prices]) => ({ product, prices }));
  if (products.length === 0) return null;

  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Topezia — manage your plan" },
    metadata: { topezia_kind: KIND, topezia_prices: fingerprint },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
      subscription_cancel: {
        enabled: true,
        // Same posture as membership: they keep what they paid for until the
        // period ends, and the webhook returns them to FREE when it does.
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price", "promotion_code"],
        // Credit the unused part against the next invoice rather than
        // charging on the spot — an upgrade should never produce a surprise
        // card charge the moment someone clicks it.
        proration_behavior: "create_prorations",
        products,
      },
    },
  });

  cached = { fingerprint, id: created.id };
  return created.id;
}
