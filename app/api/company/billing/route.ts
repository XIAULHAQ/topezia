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
import { companyPortalConfigId } from "@/lib/billing/portal";
import { PLANS, planFor, priceIdFor, isPlanId, brandingCouponFor, brandingDiscountOffered, type BillingPeriod } from "@/lib/billing/plans";
import { getCoupon } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
const RETURN = `${SITE}/employer/billing`;

/**
 * Subscription states a plan switch may be offered from. `past_due` and
 * `unpaid` are in deliberately — someone whose card bounced can still move
 * to a cheaper plan, and blocking that is how you turn a billing hiccup into
 * a cancellation. `canceled`/`incomplete_expired` are not: there is nothing
 * left to update, so those fall through to a fresh Checkout.
 */
const SWITCHABLE = new Set(["active", "trialing", "past_due", "unpaid"]);

/**
 * Does Stripe hold a live subscription for this customer? Asked because a
 * customer id proves only that someone once opened checkout — it is minted
 * before the session, so an abandoned checkout leaves one behind.
 *
 * Answers FALSE when Stripe can't be reached. That direction is the safe
 * one for a read: the page offers a purchase, and the POST re-checks and
 * fails closed rather than creating a second subscription.
 */
async function hasLiveSubscription(customerId: string | null): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe || !customerId) return false;
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    return subs.data.some((s) => SWITCHABLE.has(s.status));
  } catch (err) {
    console.error("[company/billing] subscription check failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

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
    // Whether a SUBSCRIPTION exists, which is not the same question as which
    // plan they're on. A comped company is PRO with nothing behind it, and
    // labelling that "Current · On this plan" both misleads them and locks
    // them out of buying the plan they're being given for free. The page
    // needs both facts to say anything true.
    subscribed: await hasLiveSubscription(company?.stripeCustomerId ?? null),
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
    select: { id: true, plan: true, stripeCustomerId: true, brandingDiscount: true },
  });
  if (!company) return NextResponse.json({ error: "Set up your company first." }, { status: 404 });

  // ── Manage an existing subscription ──────────────────────────────────
  if (body.action === "portal") {
    if (!company.stripeCustomerId) {
      return NextResponse.json({ error: "No billing history for this company yet." }, { status: 404 });
    }
    try {
      // A configuration that only ever lists BUSINESS plans, so switching
      // here can't offer a member's product. Failing to build it must not
      // cost the customer their invoices and card details, so the portal
      // still opens on the default configuration.
      let configuration: string | null = null;
      try {
        configuration = await companyPortalConfigId(stripe);
      } catch (err) {
        console.error("[company/billing] portal config failed, using default:", err instanceof Error ? err.message : err);
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: company.stripeCustomerId,
        return_url: RETURN,
        ...(configuration ? { configuration } : {}),
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

  // NOTE: there is deliberately no "you're already on that plan" check
  // against our own column here. A comped company reads as PRO with nothing
  // behind it, and turning that comp into a real subscription is a purchase
  // we should accept. Whether this is a switch or a purchase is decided
  // below, by what Stripe says exists.

  // ── Already subscribed: this is a SWITCH, not a new subscription ──────
  //
  // WHICH BRANCH WE TAKE IS DECIDED BY STRIPE, NOT BY OUR PLAN COLUMN. The
  // column says PRO for a comped company and for a stale customer left over
  // from an abandoned checkout, neither of which has anything to switch —
  // sending those to the portal is the dead end this replaced. Only a live
  // subscription gets the update flow; everything else buys normally below,
  // reusing the customer we already minted.
  //
  // The deep link lands on Stripe's confirmation for the exact plan clicked
  // — "Studio, $129/month, less the unused part of your Pro month". Stripe
  // owns the proration and the receipt; the webhook still writes the plan
  // when the subscription actually changes.
  let existing: { subscription: string; item: string; priceId: string | null } | null = null;
  if (company.stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: company.stripeCustomerId,
        status: "all",
        limit: 20,
      });
      const sub = subs.data.find((s) => SWITCHABLE.has(s.status));
      // The update flow takes exactly one item; a multi-item subscription
      // isn't ours and must not be rewritten from here.
      const item = sub && sub.items.data.length === 1 ? sub.items.data[0] : null;
      if (sub && item) existing = { subscription: sub.id, item: item.id, priceId: item.price?.id ?? null };
    } catch (err) {
      console.error("[company/billing] subscription lookup failed:", err instanceof Error ? err.message : err);
      // Fail CLOSED: we don't know whether they're subscribed, and guessing
      // wrong means a second subscription on the same card.
      return NextResponse.json({ error: "Couldn't check your subscription — try again shortly." }, { status: 502 });
    }
  }

  if (existing) {
    if (existing.priceId === priceId) {
      return NextResponse.json({ error: `You're already on that ${PLANS[plan].name} price.`, portal: true }, { status: 409 });
    }
    try {
      // Carry the badge discount across the switch. It is per-interval, so
      // a monthly→yearly move needs the OTHER coupon; sending nothing would
      // quietly bill them full price while their chat still shows our line.
      const keepsBadge = company.brandingDiscount || body.keepBranding === true;
      const coupon = keepsBadge ? brandingCouponFor(period) : null;
      if (keepsBadge && !coupon) {
        return NextResponse.json(
          { error: "That billing period isn't available with the branding discount right now." },
          { status: 503 }
        );
      }

      // The update flow needs a configuration listing the target price. If
      // one can't be built, open the plain portal rather than erroring —
      // their card and invoices matter more than the shortcut, and the
      // switch is two clicks away once they're there.
      let configuration: string | null = null;
      try {
        configuration = await companyPortalConfigId(stripe);
      } catch (err) {
        console.error("[company/billing] portal config failed:", err instanceof Error ? err.message : err);
      }

      const base = {
        customer: company.stripeCustomerId!,
        return_url: RETURN,
        ...(configuration ? { configuration } : {}),
      };

      let url: string | null = null;
      if (configuration) {
        try {
          const flow = await stripe.billingPortal.sessions.create({
            ...base,
            flow_data: {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: existing.subscription,
                items: [{ id: existing.item, price: priceId, quantity: 1 }],
                ...(coupon ? { discounts: [{ coupon }] } : {}),
              },
              after_completion: {
                type: "redirect",
                redirect: { return_url: `${RETURN}?switched=1` },
              },
            },
          });
          url = flow.url;
        } catch (err) {
          // A subscription on a price the configuration doesn't list (a
          // legacy or member price) can't be deep-linked. Don't strand
          // them on an error — open the portal itself.
          console.error("[company/billing] update flow rejected, opening plain portal:", err instanceof Error ? err.message : err);
        }
      }
      if (!url) url = (await stripe.billingPortal.sessions.create(base)).url;
      return NextResponse.json({ url });
    } catch (err) {
      console.error("[company/billing] plan switch failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Couldn't open the plan change — try again shortly." }, { status: 502 });
    }
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
