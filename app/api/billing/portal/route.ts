/**
 * POST /api/billing/portal — Stripe's hosted Billing Portal.
 *
 * Where a member updates their card, sees invoices, or cancels. Cancellation
 * flows back through the subscription webhook — nothing here writes tier.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getStripe } from "@/lib/billing/stripe";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

export async function POST(_req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't available." }, { status: 503 });

  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`billing-portal:${userId}`, 15, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { stripeCustomerId: true } });
  if (!profile?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing history on this account." }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${SITE}/pricing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] portal failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't open billing — try again shortly." }, { status: 502 });
  }
}
