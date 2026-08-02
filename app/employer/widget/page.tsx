import type { Metadata } from "next";
import EmployerShell from "../_components/EmployerShell";
import WidgetClient from "./widget-client";
import type { PlanOffer } from "./plans";
import { planCatalogue } from "@/lib/billing/catalogue";
import { PLANS } from "@/lib/billing/plans";
import { billingConfigured } from "@/lib/billing/stripe";

export const metadata: Metadata = { title: "Site chat — Topezia", robots: { index: false } };

/**
 * Prices are read from Stripe HERE rather than typed into the client, for the
 * same reason as the public pricing page: an owner comparing plans on this
 * screen must be looking at what we would actually charge them. A plan Stripe
 * has no live price for is marked not-for-sale rather than shown with a
 * button that fails at checkout.
 */
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString();

export default async function EmployerWidgetPage() {
  const sellable = billingConfigured() ? await planCatalogue() : [];
  const free = PLANS.FREE;

  const offers: PlanOffer[] = [
    {
      id: "FREE",
      name: "Free",
      monthly: "$0",
      yearly: "$0",
      perMonth: "forever",
      perYear: "forever",
      noteMonthly: "1 website · no card",
      noteYearly: "1 website · no card",
      feats: [
        `${n(free.aiRepliesPerMonth)} AI replies a month`,
        `${n(free.pages)} pages scanned`,
        "Unlimited leads and inbox",
        `Teach it ${n(free.facts)} answers`,
      ],
      forSale: true,
    },
    ...sellable.map((p) => ({
      id: p.id,
      name: p.name,
      monthly: p.monthly ? p.monthly.label.replace(/\/month$/, "") : "—",
      yearly: p.yearly ? `$${(p.yearly.amount / 100).toLocaleString("en-US")}` : "—",
      perMonth: "/month",
      perYear: "/year",
      noteMonthly: p.yearly ? `or $${(p.yearly.amount / 100).toLocaleString("en-US")} billed yearly` : "billed monthly",
      noteYearly: "Two months free",
      feats: [
        p.sites === 1 ? "1 website" : `${p.sites} websites`,
        `${n(p.aiRepliesPerMonth)} AI replies a month${p.sites > 1 ? ", shared" : ""}`,
        `${n(p.pages)} pages scanned${p.sites > 1 ? " each" : ""}`,
        `Teach it ${n(p.facts)} answers`,
        ...(p.aiAssist ? ["Order tracking, weekly digest, intake briefs"] : []),
        ...(!p.branded ? ["No Topezia branding, your own colour"] : []),
      ],
      forSale: p.forSale,
    })),
  ];

  return (
    <EmployerShell>
      <WidgetClient offers={offers} />
    </EmployerShell>
  );
}
