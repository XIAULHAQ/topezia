/**
 * POST /api/billing/webhook — Stripe events; the ONLY writer of Profile.tier
 * AND Company.plan.
 *
 * The signature is the entire authentication: constructEvent verifies the
 * HMAC over the RAW body against STRIPE_WEBHOOK_SECRET, so a forged POST
 * can't grant Premium. Idempotent by construction — every handler derives
 * state from the subscription object in the event, it never increments.
 *
 * Tier truth table:
 *   subscription active/trialing  → PREMIUM, premiumUntil = current period end
 *   anything else (canceled, unpaid, paused, expired) → FREE
 * A member who cancels keeps PREMIUM until Stripe ends the period, because
 * Stripe keeps the subscription active until then — no logic needed here.
 *
 * Business plans follow the same shape one level up. Which one a
 * subscription is comes from its own metadata (set at checkout, carried on
 * every later event), and WHICH plan comes from the price it actually
 * carries — so a company that switches Pro to Studio inside Stripe's portal
 * lands on Studio here without us being told separately.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing/stripe";
import { planForPriceId } from "@/lib/billing/plans";

export const runtime = "nodejs"; // signature check uses node crypto

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  if (sub.metadata?.topezia_kind === "company") return applyCompanySubscription(sub);
  return applyMemberSubscription(sub);
}

async function applyCompanySubscription(sub: Stripe.Subscription): Promise<void> {
  const companyId = sub.metadata?.companyId;
  if (!companyId) throw new Error(`company subscription ${sub.id} has no companyId`);

  const live = sub.status === "active" || sub.status === "trialing";
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;
  // The PRICE decides the plan — metadata could be stale after a switch.
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = live ? planForPriceId(priceId) : null;
  if (live && !plan) {
    // An active subscription on a price we don't recognise: leave the plan
    // alone and shout. Downgrading a paying customer because an env var is
    // missing would be the worst possible guess.
    console.error(`[billing] company sub ${sub.id} on unknown price ${priceId} — plan left unchanged`);
    return;
  }

  // The badge trade travels on the subscription's own metadata, so it
  // survives renewals and plan switches. A subscription that ends takes the
  // discount with it, so the badge obligation ends too.
  const keepsBadge = live && sub.metadata?.topezia_branding === "1";

  await prisma.company.updateMany({
    where: { id: companyId },
    data: plan
      ? { plan, planUntil: periodEnd ? new Date(periodEnd * 1000) : null, brandingDiscount: keepsBadge }
      : { plan: "FREE", planUntil: null, brandingDiscount: false },
  });
}

async function applyMemberSubscription(sub: Stripe.Subscription): Promise<void> {
  // We always create and pass a v1 Customer, so `customer` is what comes back.
  // `customer_account` is the v2-accounts shape Stripe uses when Checkout mints
  // the buyer itself; falling back to it costs nothing and the failure it
  // prevents is the worst one there is — money taken, tier never flipped.
  const customerId =
    (typeof sub.customer === "string" ? sub.customer : sub.customer?.id) ?? sub.customer_account;
  if (!customerId) throw new Error(`subscription ${sub.id} has no customer`);
  const premium = sub.status === "active" || sub.status === "trialing";
  // Newer API versions carry the period end per item; they end together.
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;
  await prisma.profile.updateMany({
    where: { stripeCustomerId: customerId },
    data: premium
      ? { tier: "PREMIUM", premiumUntil: periodEnd ? new Date(periodEnd * 1000) : null }
      : { tier: "FREE", premiumUntil: null },
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    // req.text(), not req.json(): the signature covers the exact raw bytes.
    event = stripe.webhooks.constructEvent(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // The session object doesn't carry subscription state — fetch it so
        // the first grant uses the same truth table as every later event.
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await applySubscription(await stripe.subscriptions.retrieve(subId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object);
        break;
      default:
        break; // subscribed events only; anything else is acknowledged and ignored
    }
  } catch (err) {
    console.error("[billing] webhook handling failed:", event.type, err instanceof Error ? err.message : err);
    // Non-2xx makes Stripe retry with backoff — exactly what we want for a
    // transient DB failure.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
