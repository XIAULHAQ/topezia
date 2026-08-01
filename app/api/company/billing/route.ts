/**
 * GET  /api/company/billing — the company's plan, and what's for sale.
 * POST /api/company/billing — start a plan purchase, or open the portal.
 *
 * The business twin of /api/billing/*, with one deliberate difference: the
 * subscription belongs to the COMPANY, not to the person who clicked buy.
 * An owner handover must not cancel the plan, so the Stripe customer is
 * minted against the company and stored there.
 *
 * This route never grants anything. The webhook is the only writer of
 * Company.plan, exactly as it is for Profile.tier — a success redirect is a
 * UI signal, never proof of payment.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner, userEmail } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { getStripe, billingConfigured, getPrices, formatPrice, BUSINESS_INTEGRATION_ID } from "@/lib/billing/stripe";
import { PLANS, planFor, priceIdFor, sellablePlans, isPlanId, type BillingPeriod } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
const RETURN = `${SITE}/employer/billing`;

/** The plans, with live Stripe amounts where they exist. */
export async function planCatalogue() {
  const sellable = sellablePlans();
  const ids = sellable.flatMap((p) =>
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
      // "For sale" means Stripe returned a live price — not merely that an
      // env var is set. A mistyped price id shows as not-for-sale, which is
      // the honest outcome, rather than a button that fails at checkout.
      forSale: Boolean(month || year),
      monthly: month ? { amount: month.amount, label: formatPrice(month) } : null,
      yearly: year ? { amount: year.amount, label: formatPrice(year) } : null,
    };
  });
}

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const [company, plans] = await Promise.all([
    prisma.company.findUnique({
      where: { id: auth.owner.companyId },
      select: { plan: true, planUntil: true, stripeCustomerId: true },
    }),
    planCatalogue(),
  ]);

  return NextResponse.json({
    plan: planFor(company),
    planUntil: company?.planUntil ?? null,
    hasBillingHistory: Boolean(company?.stripeCustomerId),
    billingLive: billingConfigured(),
    free: PLANS.FREE,
    plans,
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Plans aren't on sale yet." }, { status: 503 });

  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, name: companyName } = auth.owner;

  if (!rateLimit(`company-billing:${userId}`, 12, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, plan: true, stripeCustomerId: true },
  });
  if (!company) return NextResponse.json({ error: "Set up your company first." }, { status: 404 });

  // ── Manage an existing subscription ──────────────────────────────────
  if (body.action === "portal") {
    if (!company.stripeCustomerId) {
      return NextResponse.json({ error: "No billing history for this company yet." }, { status: 404 });
    }
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: company.stripeCustomerId,
        return_url: RETURN,
      });
      return NextResponse.json({ url: session.url });
    } catch (err) {
      console.error("[company/billing] portal failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Couldn't open billing — try again shortly." }, { status: 502 });
    }
  }

  // ── Buy a plan ────────────────────────────────────────────────────────
  const plan = body.plan;
  const period = body.period === "year" ? ("year" as BillingPeriod) : ("month" as BillingPeriod);
  if (!isPlanId(plan) || plan === "FREE") {
    return NextResponse.json({ error: "Pick a plan." }, { status: 400 });
  }
  const priceId = priceIdFor(plan, period);
  if (!priceId) return NextResponse.json({ error: `${PLANS[plan].name} isn't on sale yet.` }, { status: 503 });

  // Already on this plan? The portal is where you change or cancel it —
  // a second Checkout would create a second subscription.
  if (company.plan === plan) {
    return NextResponse.json({ error: `You're already on ${PLANS[plan].name}.`, portal: true }, { status: 409 });
  }
  if (company.stripeCustomerId && company.plan !== "FREE") {
    return NextResponse.json(
      { error: "Change your plan from the billing portal so it's a switch, not a second subscription.", portal: true },
      { status: 409 }
    );
  }

  try {
    // One Stripe customer per COMPANY, minted on first checkout and reused
    // forever — this is what lets the webhook and the portal find them.
    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (await userEmail(userId)) ?? undefined,
        name: companyName,
        metadata: { companyId: company.id, topezia_kind: "company" },
      });
      customerId = customer.id;
      await prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${RETURN}?upgraded=1`,
      cancel_url: RETURN,
      allow_promotion_codes: true,
      // payment_method_types deliberately absent — see the member checkout.
      integration_identifier: BUSINESS_INTEGRATION_ID,
      // On the SUBSCRIPTION, not just the session: the webhook reads these
      // on every later event too (renewals, cancellations, plan switches),
      // long after the checkout session is history.
      subscription_data: { metadata: { topezia_kind: "company", companyId: company.id } },
      metadata: { topezia_kind: "company", companyId: company.id },
    });
    if (!session.url) throw new Error("checkout session has no url");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[company/billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't start checkout — try again shortly." }, { status: 502 });
  }
}
