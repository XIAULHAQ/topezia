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
import { getStripe, billingConfigured, BUSINESS_INTEGRATION_ID } from "@/lib/billing/stripe";
import { planCatalogue } from "@/lib/billing/catalogue";
import { PLANS, planFor, priceIdFor, isPlanId, brandingCouponFor, brandingDiscountOffered, type BillingPeriod } from "@/lib/billing/plans";
import { getCoupon } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
const RETURN = `${SITE}/employer/billing`;

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const [company, plans] = await Promise.all([
    prisma.company.findUnique({
      where: { id: auth.owner.companyId },
      select: { plan: true, planUntil: true, stripeCustomerId: true, brandingDiscount: true },
    }),
    planCatalogue(),
  ]);

  const [monthOff, yearOff] = await Promise.all([
    getCoupon(brandingCouponFor("month")),
    getCoupon(brandingCouponFor("year")),
  ]);

  return NextResponse.json({
    plan: planFor(company),
    planUntil: company?.planUntil ?? null,
    hasBillingHistory: Boolean(company?.stripeCustomerId),
    billingLive: billingConfigured(),
    free: PLANS.FREE,
    plans,
    // The keep-our-badge trade, with the real amounts Stripe will apply.
    branding: {
      offered: brandingDiscountOffered(),
      on: Boolean(company?.brandingDiscount),
      monthly: monthOff,
      yearly: yearOff,
    },
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

  // ── Turn the keep-our-badge trade on or off, mid-subscription ────────
  if (body.action === "branding") {
    const want = body.keepBranding === true;
    if (!company.stripeCustomerId || company.plan === "FREE") {
      return NextResponse.json({ error: "This applies to paid plans." }, { status: 409 });
    }
    try {
      const subs = await stripe.subscriptions.list({ customer: company.stripeCustomerId, status: "active", limit: 1 });
      const sub = subs.data[0];
      if (!sub) return NextResponse.json({ error: "No active subscription to change." }, { status: 404 });

      const period = sub.items.data[0]?.price?.recurring?.interval === "year" ? "year" : "month";
      const coupon = brandingCouponFor(period);
      if (want && !coupon) {
        return NextResponse.json({ error: "That offer isn't available right now." }, { status: 503 });
      }

      // Stripe is the record of what they pay; our column is the record of
      // what we show. Money first — if the discount doesn't apply we must
      // not start displaying a badge they aren't being paid for.
      await stripe.subscriptions.update(sub.id, {
        discounts: want ? [{ coupon: coupon! }] : [],
        metadata: { ...sub.metadata, topezia_branding: want ? "1" : "0" },
      });
      await prisma.company.update({ where: { id: company.id }, data: { brandingDiscount: want } });
      return NextResponse.json({ brandingDiscount: want });
    } catch (err) {
      console.error("[company/billing] branding toggle failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Couldn't change that — try again shortly." }, { status: 502 });
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

    // Keeping our badge is a standing discount, applied as a coupon.
    // Stripe forbids discounts and allow_promotion_codes together, so the
    // buyer gets one or the other — the badge trade wins when chosen.
    const keepBranding = body.keepBranding === true;
    const brandingCoupon = keepBranding ? brandingCouponFor(period) : null;
    if (keepBranding && !brandingCoupon) {
      return NextResponse.json({ error: "That offer isn't available right now." }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${RETURN}?upgraded=1`,
      cancel_url: RETURN,
      ...(brandingCoupon
        ? { discounts: [{ coupon: brandingCoupon }] }
        : { allow_promotion_codes: true }),
      // payment_method_types deliberately absent — see the member checkout.
      integration_identifier: BUSINESS_INTEGRATION_ID,
      // On the SUBSCRIPTION, not just the session: the webhook reads these
      // on every later event too (renewals, cancellations, plan switches),
      // long after the checkout session is history.
      subscription_data: {
        metadata: { topezia_kind: "company", companyId: company.id, topezia_branding: keepBranding ? "1" : "0" },
      },
      metadata: { topezia_kind: "company", companyId: company.id },
    });
    if (!session.url) throw new Error("checkout session has no url");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[company/billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't start checkout — try again shortly." }, { status: 502 });
  }
}
