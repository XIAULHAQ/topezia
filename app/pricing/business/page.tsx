import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { planCatalogue } from "@/lib/billing/catalogue";
import { PLANS } from "@/lib/billing/plans";
import { billingConfigured, getCoupon } from "@/lib/billing/stripe";
import { brandingCouponFor } from "@/lib/billing/plans";

/**
 * Public pricing for the site chat.
 *
 * Every number here is read from Stripe at render time, so the page can
 * never advertise a price we don't actually charge. A plan Stripe has no
 * live price for is shown as not-yet-on-sale rather than with a button that
 * fails at checkout — the same honesty rule as the member pricing page.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Site chat pricing — Topezia",
  description:
    "An AI assistant for your own website that answers from your pages and turns visitors into leads in your inbox. Free to start.",
};

const n = (v: number) => v.toLocaleString();

export default async function BusinessPricingPage() {
  const plans = billingConfigured() ? await planCatalogue() : [];
  // The keep-our-badge trade, only mentioned when a real coupon backs it.
  const badgeOff = billingConfigured() ? await getCoupon(brandingCouponFor("month")) : null;

  const free = PLANS.FREE;
  const cards = [
    {
      id: "FREE" as const,
      name: "Free",
      price: "$0",
      sub: "forever, 1 website",
      limits: free,
      cta: { label: "Start free", href: "/employer/widget" },
      note: null as string | null,
    },
    ...plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.monthly?.label ?? p.yearly?.label ?? "—",
      // Just the amount: the label carries "/year", and "…/year billed
      // yearly" says it twice.
      sub: p.yearly
        ? `or $${(p.yearly.amount / 100).toLocaleString("en-US")} billed yearly`
        : p.sites === 1 ? "per website" : `up to ${p.sites} websites`,
      limits: p,
      cta: p.forSale ? { label: `Choose ${p.name}`, href: "/employer/billing" } : null,
      // "Coming soon" when we have a real price but can't deliver the plan
      // yet; "not on sale" when there is no price at all. Different states.
      note: p.forSale ? null : p.monthly || p.yearly ? "Coming soon." : "Not on sale yet.",
    })),
  ];

  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 20px 72px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px", margin: "0 0 10px" }}>
          An AI assistant for your website
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "#475569", maxWidth: 640, margin: "0 0 8px" }}>
          It reads your own pages and answers your visitors from them — then hands you the people worth talking
          to, in one inbox, with the whole conversation attached.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#64748B", maxWidth: 640, margin: "0 0 34px" }}>
          Leads, your inbox and deal tracking are free forever. The plans buy AI capacity.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 16 }}>
          {cards.map((c) => (
            <div key={c.id} style={{
              background: "#fff", border: `1px solid ${c.id === "PRO" ? "#C7D2FE" : "#E2E8F0"}`,
              borderRadius: 16, padding: 22, display: "flex", flexDirection: "column",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <b style={{ fontSize: 16 }}>{c.name}</b>
                {c.id === "PRO" && (
                  <span style={{ background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, fontWeight: 700 }}>
                    Most popular
                  </span>
                )}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", margin: "10px 0 2px" }}>{c.price}</div>
              <div style={{ fontSize: 12.5, color: "#64748B", minHeight: 34 }}>{c.sub}</div>
              <ul style={{ margin: "14px 0 18px", paddingLeft: 18, color: "#475569", fontSize: 13, lineHeight: 1.9, flex: 1 }}>
                <li>{c.limits.sites === 1 ? "1 website" : `${c.limits.sites} websites`}</li>
                <li>{n(c.limits.aiRepliesPerMonth)} AI answers a month{c.limits.sites > 1 ? ", shared" : ""}</li>
                <li>{n(c.limits.pages)} pages scanned</li>
                <li>Unlimited leads, inbox and deal tracking</li>
                <li>Teach it {n(c.limits.facts)} answers</li>
                {c.limits.aiAssist && <li>Drafted replies, weekly digest, intake briefs</li>}
                {!c.limits.branded && <li>No Topezia branding, your own colour</li>}
              </ul>
              {c.cta ? (
                <Link href={c.cta.href} style={{
                  display: "block", textAlign: "center", textDecoration: "none",
                  background: c.id === "FREE" ? "#fff" : "linear-gradient(135deg,#8B5CF6,#3B82F6)",
                  color: c.id === "FREE" ? "#334155" : "#fff",
                  border: c.id === "FREE" ? "1px solid #E2E8F0" : "none",
                  borderRadius: 10, padding: "11px 18px", fontSize: 13.5, fontWeight: 700,
                }}>
                  {c.cta.label}
                </Link>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "#94A3B8", textAlign: "center" }}>{c.note}</p>
              )}
            </div>
          ))}
        </div>

        {badgeOff && (
          <p style={{
            marginTop: 22, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12,
            padding: "13px 16px", fontSize: 13.5, color: "#065F46", lineHeight: 1.65, maxWidth: 640,
          }}>
            <b>Keep a small &ldquo;AI chat powered by Topezia&rdquo; line on your chat and save {badgeOff.label} a
            month</b> on any paid plan. Turn it off whenever you like — the discount stops with it.
          </p>
        )}

        <p style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 24, lineHeight: 1.7, maxWidth: 640 }}>
          Payment is handled by Stripe; your card never touches Topezia. Cancel any time — you keep the plan
          until the period you paid for ends. Running out of AI answers never stops the chat from taking
          messages, on any plan.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
