/**
 * POST /api/billing/webhook — Stripe events; the ONLY writer of Profile.tier.
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
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs"; // signature check uses node crypto

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
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
