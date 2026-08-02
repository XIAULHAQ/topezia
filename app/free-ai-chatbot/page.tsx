import type { Metadata } from "next";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { planCatalogue } from "@/lib/billing/catalogue";
import { PLANS, brandingCouponFor } from "@/lib/billing/plans";
import { billingConfigured, getCoupon } from "@/lib/billing/stripe";
import ChatbotLanding from "./landing";
import { FAQS, type PlanCard } from "./content";

/**
 * /free-ai-chatbot — the public page for the site chat.
 *
 * The layout is the approved design, rendered by ./landing.tsx. What lives
 * here is everything that must not be hardcoded: the prices, which come from
 * Stripe at render time, and the plan limits, which come from the plan table.
 * The design mocks up $39 and $129; if Stripe ever disagrees with the mockup,
 * Stripe wins, because that is what a customer is actually charged.
 *
 * The page also carries its own chrome rather than SiteNav/SiteFooter — the
 * design gives it a landing-page header with section anchors and a single
 * "Get it free" action, which is the point of a landing page.
 */
export const dynamic = "force-dynamic";

const TITLE = "Free AI Chatbot for Your Website & Ecommerce Store — Topezia Site Chat";
const DESCRIPTION =
  "A free AI chatbot for your website that reads your own pages, answers visitors accurately, captures leads and sells products. The AI chatbot for ecommerce websites on Shopify, WooCommerce and BigCommerce. One line of code, no card.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/free-ai-chatbot" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/free-ai-chatbot" },
};

const n = (v: number) => v.toLocaleString();

export default async function FreeAiChatbotPage() {
  const sellable = billingConfigured() ? await planCatalogue() : [];
  const coupon = billingConfigured() ? await getCoupon(brandingCouponFor("month")) : null;
  const free = PLANS.FREE;

  const plans: PlanCard[] = [
    {
      name: "Free",
      price: "$0",
      per: "forever",
      note: "1 website · no card",
      flag: null,
      feats: [
        `${n(free.aiRepliesPerMonth)} AI answers a month`,
        `${n(free.pages)} pages scanned`,
        "Unlimited leads and inbox",
        `Teach it ${n(free.facts)} answers`,
      ],
      href: "/employer/widget",
      cta: "Start free",
      dark: false,
    },
    ...sellable.map((p) => ({
      name: p.name,
      price: p.monthly ? p.monthly.label.replace(/\/month$/, "") : p.yearly?.label ?? "—",
      per: p.monthly ? "/month" : p.yearly ? "/year" : "",
      note: p.yearly ? `or $${(p.yearly.amount / 100).toLocaleString("en-US")} billed yearly` : p.sites === 1 ? "per website" : `up to ${p.sites} websites`,
      // The design flags exactly one plan, and gives that same plan the dark
      // card. Keeping them on the same plan keeps the emphasis single.
      flag: p.id === "PRO" ? "Most popular" : null,
      feats: [
        p.sites === 1 ? "1 website" : `${p.sites} websites`,
        `${n(p.aiRepliesPerMonth)} AI answers a month${p.sites > 1 ? ", shared" : ""}`,
        `${n(p.pages)} pages scanned`,
        `Teach it ${n(p.facts)} answers`,
        ...(p.aiAssist ? ["Drafted replies, weekly digest, intake briefs"] : []),
        ...(!p.branded ? ["No Topezia branding, your own colour"] : []),
      ],
      // A plan Stripe has no live price for gets no checkout button — it says
      // so instead, rather than offering a button that 503s.
      href: p.forSale ? "/employer/billing" : "/pricing/business",
      cta: p.forSale ? `Choose ${p.name}` : "Not on sale yet",
      dark: p.id === "PRO",
    })),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Topezia Site Chat",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <ChatbotLanding plans={plans} badgeOff={coupon?.label ?? null} />
    </>
  );
}
