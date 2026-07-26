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
import { getStripe, PREMIUM_PRICE_ID } from "@/lib/billing/stripe";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

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
      metadata: { profileId: profile.id },
    });
    if (!session.url) throw new Error("checkout session has no url");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't start checkout — try again shortly." }, { status: 502 });
  }
}
