/**
 * What each business plan allows — the single place that decides.
 *
 * Every gate in the product reads this table. Nothing else hardcodes a
 * limit, so raising the free tier or adding a plan is one edit here.
 *
 * The split between free and paid is not arbitrary: PAID IS WHERE OUR COST
 * PER USE IS. AI answers, drafted replies, weekly digests and intake briefs
 * each spend model tokens per use, so they carry the plan. Everything
 * computed from data we already hold — the inbox, lead capture, deal
 * tracking and its totals, voice input, language matching, office hours —
 * stays free forever, because it costs us nothing and it is what convinces
 * a free company that the paid part is worth buying.
 *
 * THE HUMAN HANDOFF IS NEVER GATED, on any plan, at any limit. A company
 * that runs out of AI answers still collects every lead. Capping that would
 * punish them for being popular, which is backwards.
 *
 * PRICES LIVE IN STRIPE, NOT HERE. We map price IDs to plans and read the
 * amounts back from the API, so changing what you charge is a Stripe edit
 * and a redeploy — never a code change.
 */
export type PlanId = "FREE" | "PRO" | "STUDIO";
export type BillingPeriod = "month" | "year";

export type PlanLimits = {
  id: PlanId;
  name: string;
  /** How many websites this plan may run the chat on. */
  sites: number;
  /** Pages read per scan. */
  pages: number;
  /** Model-answered messages per month. Pooled across sites when sites > 1. */
  aiRepliesPerMonth: number;
  /** Owner-written answers ("teach the bot") per site. */
  facts: number;
  /** Show the "Add AI chat to your site. Free with Topezia." line. */
  branded: boolean;
  /** Drafted replies, weekly digest, intake briefs — the per-use AI costs. */
  aiAssist: boolean;
  /** Custom accent colour. Pairs with removing our branding. */
  theming: boolean;
};

export const PLANS: Record<PlanId, PlanLimits> = {
  FREE: {
    id: "FREE",
    name: "Free",
    sites: 1,
    pages: 60,
    aiRepliesPerMonth: 200,
    facts: 10,
    branded: true,
    aiAssist: false,
    theming: false,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    sites: 1,
    pages: 500,
    aiRepliesPerMonth: 2_000,
    facts: 100,
    branded: false,
    aiAssist: true,
    theming: true,
  },
  STUDIO: {
    id: "STUDIO",
    name: "Studio",
    sites: 10,
    pages: 500,
    aiRepliesPerMonth: 10_000, // pooled across the ten sites
    facts: 100,
    branded: false,
    aiAssist: true,
    theming: true,
  },
};

export const isPlanId = (v: unknown): v is PlanId => v === "FREE" || v === "PRO" || v === "STUDIO";

/** The limits for a company row, tolerant of anything unexpected in the column. */
export function planFor(company: { plan?: string | null } | null | undefined): PlanLimits {
  const id = company?.plan;
  return isPlanId(id) ? PLANS[id] : PLANS.FREE;
}

/**
 * Stripe price IDs, one per plan and period. Set in Vercel once the products
 * exist in Stripe; a plan with no price ID simply isn't for sale, and the
 * pricing page says so rather than showing a button that 503s.
 */
const PRICE_ENV: Record<Exclude<PlanId, "FREE">, Record<BillingPeriod, string>> = {
  PRO: { month: "STRIPE_PRO_MONTHLY_PRICE_ID", year: "STRIPE_PRO_YEARLY_PRICE_ID" },
  STUDIO: { month: "STRIPE_STUDIO_MONTHLY_PRICE_ID", year: "STRIPE_STUDIO_YEARLY_PRICE_ID" },
};

export function priceIdFor(plan: PlanId, period: BillingPeriod): string | null {
  if (plan === "FREE") return null;
  return process.env[PRICE_ENV[plan][period]] || null;
}

/** Which plan a Stripe price belongs to — the webhook's source of truth.
 *  Derived from the subscription's actual price, so a plan switch made in
 *  Stripe's own portal lands correctly without us being told about it. */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const plan of ["PRO", "STUDIO"] as const) {
    for (const period of ["month", "year"] as const) {
      if (priceIdFor(plan, period) === priceId) return plan;
    }
  }
  return null;
}

/** Plans that are actually purchasable right now. */
export function sellablePlans(): Exclude<PlanId, "FREE">[] {
  return (["PRO", "STUDIO"] as const).filter((p) => priceIdFor(p, "month") || priceIdFor(p, "year"));
}

/**
 * The branding discount: keep an "AI chat powered by Topezia" line on the
 * widget, pay less. One coupon per billing interval, because a Stripe
 * amount_off coupon applies PER INVOICE — a $5 coupon on a yearly invoice
 * would take off $5, not $60.
 *
 * Like prices, the amounts live in Stripe. We only hold the coupon ids, and
 * the real discount is read back from the API for display, so what the page
 * promises and what checkout charges cannot drift.
 */
const BRANDING_COUPON_ENV: Record<BillingPeriod, string> = {
  month: "STRIPE_BRANDING_COUPON_MONTHLY",
  year: "STRIPE_BRANDING_COUPON_YEARLY",
};

export function brandingCouponFor(period: BillingPeriod): string | null {
  return process.env[BRANDING_COUPON_ENV[period]] || null;
}

/** Is the keep-the-badge trade available to offer at all? */
export function brandingDiscountOffered(): boolean {
  return Boolean(brandingCouponFor("month") || brandingCouponFor("year"));
}
