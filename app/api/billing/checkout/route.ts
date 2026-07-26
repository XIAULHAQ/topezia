/**
 * POST /api/billing/checkout — start a Premium subscription purchase.
 *
 * Returns { url } for a Stripe-HOSTED Checkout session; the client redirects
 * there and Stripe handles the card. Requires a real signed-in account (a
 * subscription needs an email and must survive cookie clears). This route
 * never grants anything — the webhook is the only writer of tier.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { getStripe, PREMIUM_PRICE_ID, CHECKOUT_INTEGRATION_ID } from "@/lib/billing/stripe";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

/**
 * Sales tax / VAT / GST, opt-in via STRIPE_AUTOMATIC_TAX=1.
 *
 * Off by default because live mode REJECTS the whole Checkout Session with
 * "You must have a valid head office address to enable automatic tax
 * calculation in live mode" unless Stripe Tax is onboarded — a paid add-on.
 * A sandbox accepts the same call happily, so this only ever surfaces against
 * real money. Leaving it on would mean nobody could buy at all.
 *
 * Turning the flag on is not enough on its own: tax is collected only in
 * jurisdictions with an ACTIVE registration, and the product needs a tax code.
 * Without those Stripe returns no error and simply collects nothing.
 *
 * The three fields belong together — customer_update lets Checkout save the
 * address it collects onto the customer (ours is created without one) so
 * there's something to tax against, and tax_id_collection is what makes
 * cross-border B2B reverse-charge work instead of taxing businesses as
 * consumers. Sending them without automatic_tax just adds checkout friction.
 */
function taxParams() {
  if (process.env.STRIPE_AUTOMATIC_TAX !== "1") return {};
  return {
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
  } as const;
}

export async function POST(_req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Premium isn't on sale yet." }, { status: 503 });

  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`billing-checkout:${userId}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, tier: true, stripeCustomerId: true, fullName: true },
  });
  if (!profile) return NextResponse.json({ error: "Create your profile first." }, { status: 404 });
  if (profile.tier === "PREMIUM") return NextResponse.json({ error: "You're already Premium." }, { status: 409 });

  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch { /* checkout can still proceed; Stripe collects the email */ }

  try {
    // One Stripe customer per profile, minted on first checkout and reused
    // forever — this is what lets the webhook and the portal find them.
    let customerId = profile.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        name: profile.fullName ?? undefined,
        metadata: { profileId: profile.id },
      });
      customerId = customer.id;
      await prisma.profile.update({ where: { id: profile.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PREMIUM_PRICE_ID(), quantity: 1 }],
      success_url: `${SITE}/pricing?upgraded=1`,
      cancel_url: `${SITE}/pricing`,
      allow_promotion_codes: true,
      // NOTE: payment_method_types is deliberately absent. Passing it pins
      // checkout to one method; omitting it lets Stripe show each member the
      // eligible methods for their country, configured from the Dashboard.
      ...taxParams(),
      integration_identifier: CHECKOUT_INTEGRATION_ID,
      metadata: { profileId: profile.id },
    });
    if (!session.url) throw new Error("checkout session has no url");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't start checkout — try again shortly." }, { status: 502 });
  }
}
