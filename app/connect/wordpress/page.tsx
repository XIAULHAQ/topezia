import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { planCatalogue } from "@/lib/billing/catalogue";
import { billingConfigured } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/billing/plans";
import { sanitizeDetails, safeReturnUrl, CONNECT_TTL_MS } from "@/lib/wordpress/connect";
import ConnectClient, { type ConnectView, type PlanChoice } from "./connect-client";

/**
 * /connect/wordpress — the consent screen at the middle of the plugin
 * handshake. Someone clicked "Connect" inside their own wp-admin and landed
 * here; what they see is what their website told us about itself, and what
 * we will do with it.
 *
 * THE PAGE IS THE CONSENT. Nothing has been written when it renders: the row
 * behind `state` is a pending intention and nothing more. Everything the
 * plugin sent is shown, every field is refusable, and the button says what
 * will happen. That is not decoration — a plugin that reaches into a
 * WordPress install, reads its contact details and posts them somewhere has
 * to show its work, and the WordPress guidelines are right to insist.
 *
 * `state` authorizes nothing on its own. Approving requires a signed-in
 * account, and the key the plugin ends up with is fetched by their server
 * afterwards, never handed to this browser.
 */
export const metadata: Metadata = {
  title: "Connect your WordPress site — Topezia",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString();

export default async function ConnectWordPressPage({
  searchParams,
}: {
  searchParams: { state?: string | string[] };
}) {
  const state = Array.isArray(searchParams.state) ? searchParams.state[0] : searchParams.state ?? "";

  const row = state
    ? await prisma.wpConnect.findUnique({
        where: { state },
        select: {
          host: true, siteUrl: true, returnUrl: true, details: true,
          status: true, expiresAt: true,
        },
      })
    : null;

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return <ConnectClient view={{ kind: "expired", hours: Math.round(CONNECT_TTL_MS / 3_600_000) }} />;
  }

  const { userId, authed } = await currentIdentity();
  const detected = sanitizeDetails(row.details);
  const back = safeReturnUrl(row.returnUrl, row.siteUrl);

  // Not signed in: show them exactly what they're about to connect BEFORE
  // asking for an account. "Sign in to see what this is" is how you lose
  // someone who was one click from live.
  if (!userId || !authed) {
    return (
      <ConnectClient
        view={{
          kind: "signin",
          host: row.host,
          detected,
          next: `/connect/wordpress?state=${encodeURIComponent(state)}`,
        }}
      />
    );
  }

  const company = await prisma.company.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, name: true, tagline: true, about: true, location: true, logoPath: true, plan: true },
  });

  // Already finished — a refresh, or a second tab. Say so rather than
  // offering to do it again.
  if (row.status === "APPROVED" || row.status === "CLAIMED") {
    return (
      <ConnectClient
        view={{ kind: "done", host: row.host, back, companyName: company?.name ?? null, plans: await plans(), plan: company?.plan ?? "FREE" }}
      />
    );
  }

  return (
    <ConnectClient
      view={{
        kind: "approve",
        state,
        host: row.host,
        siteUrl: row.siteUrl,
        back,
        detected,
        plans: await plans(),
        plan: company?.plan ?? "FREE",
        company: company
          ? {
              name: company.name,
              // Which fields are already written decides what we may fill.
              // Shown to them plainly, because "we won't touch what you wrote"
              // is only reassuring if you can see that we know what you wrote.
              hasTagline: Boolean(company.tagline),
              hasAbout: Boolean(company.about),
              hasLocation: Boolean(company.location),
              hasLogo: Boolean(company.logoPath),
            }
          : null,
      }}
    />
  );
}

/** The plans, priced from Stripe — same rule as everywhere else. */
async function plans(): Promise<PlanChoice[]> {
  const free = PLANS.FREE;
  const base: PlanChoice[] = [
    {
      id: "FREE",
      name: "Free",
      price: "$0",
      per: "forever",
      feats: [
        `${n(free.aiRepliesPerMonth)} AI answers a month`,
        `${n(free.pages)} pages read`,
        "Unlimited leads and inbox",
        "A small Topezia line on the chat",
      ],
      forSale: true,
    },
  ];
  if (!billingConfigured()) return base;

  const sellable = await planCatalogue();
  return [
    ...base,
    ...sellable.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.monthly ? p.monthly.label.replace(/\/month$/, "") : "—",
      per: "/month",
      feats: [
        p.sites === 1 ? "1 website" : `${p.sites} websites`,
        `${n(p.aiRepliesPerMonth)} AI answers a month${p.sites > 1 ? ", shared" : ""}`,
        `${n(p.pages)} pages read`,
        "No Topezia branding, your own colour",
      ],
      forSale: p.forSale,
    })),
  ];
}
