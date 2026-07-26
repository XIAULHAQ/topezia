/**
 * Stripe billing — the Premium purchase rail.
 *
 * Design decisions, stated once:
 *  - Stripe-HOSTED Checkout and Billing Portal, reached by redirect. No
 *    stripe.js on our pages, so the enforced CSP needs no new script hosts
 *    and no card data ever crosses our origin.
 *  - Everything is gated on billingConfigured(): until STRIPE_SECRET_KEY,
 *    STRIPE_WEBHOOK_SECRET and STRIPE_PREMIUM_PRICE_ID are all set, the
 *    pricing page keeps its honest "Not on sale yet" and the endpoints 503.
 *    A partial config (key but no webhook secret) stays OFF — selling
 *    without the webhook would take money and never flip the tier.
 *  - The webhook is the ONLY writer of tier/premiumUntil. Checkout success
 *    redirects are a UI signal, never proof of payment.
 */
import Stripe from "stripe";

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PREMIUM_PRICE_ID);
}

let client: Stripe | null = null;

/**
 * Pinned explicitly rather than inheriting whatever the installed SDK
 * defaults to, so an `npm update` can never silently change API behaviour
 * mid-flight. Bump this deliberately, alongside the SDK.
 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

/** The Stripe client — null until billing is fully configured. */
export function getStripe(): Stripe | null {
  if (!billingConfigured()) return null;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
  return client;
}

export const PREMIUM_PRICE_ID = () => process.env.STRIPE_PREMIUM_PRICE_ID!;

/**
 * Tags Checkout Sessions in the Stripe Dashboard so this flow can be compared
 * against any future one (annual plan, employer packages). The random suffix
 * is part of Stripe's convention for these labels — it stays FIXED; changing
 * it starts a new series and breaks continuity of the reporting.
 */
export const CHECKOUT_INTEGRATION_ID = "topezia-premium-kqmwvbxz";

export interface PremiumPrice {
  amount: number; // in the currency's minor unit, e.g. cents
  currency: string; // "usd"
  interval: string; // "month" | "year"
}

/** "$9/month" from a Stripe price. */
export function formatPrice(p: PremiumPrice): string {
  const whole = p.amount % 100 === 0 ? String(p.amount / 100) : (p.amount / 100).toFixed(2);
  const sym = p.currency === "usd" ? "$" : p.currency === "eur" ? "€" : p.currency === "gbp" ? "£" : `${p.currency.toUpperCase()} `;
  return `${sym}${whole}/${p.interval}`;
}

// The price is dashboard-configured and effectively static — don't pay a
// Stripe round-trip per pricing-page view.
let priceCache: { at: number; data: PremiumPrice | null } | null = null;
const PRICE_TTL_MS = 10 * 60 * 1000;

/** The live Premium price, or null when billing is off or Stripe is unreachable. */
export async function getPremiumPrice(): Promise<PremiumPrice | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.data;
  try {
    const price = await stripe.prices.retrieve(PREMIUM_PRICE_ID());
    const data: PremiumPrice | null =
      price.active && price.unit_amount != null && price.recurring
        ? { amount: price.unit_amount, currency: price.currency, interval: price.recurring.interval }
        : null;
    priceCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("[billing] price lookup failed:", err instanceof Error ? err.message : err);
    priceCache = { at: Date.now(), data: null }; // fail closed, don't hammer
    return null;
  }
}
