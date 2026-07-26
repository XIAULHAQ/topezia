/**
 * /pricing — membership packages: Basic (free) and Premium.
 *
 * Honesty rule carried from the whole product: the buy button exists ONLY
 * while billing is actually live (Stripe fully configured and the price
 * readable). Until then the Premium card says "Not on sale yet" — never a
 * dead button, never an invented price. When live, the price shown is read
 * from Stripe itself, so the page can't drift from what checkout charges.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { getPremiumPrice, formatPrice } from "@/lib/billing/stripe";
import UpgradeButton from "./upgrade-button";

export const metadata: Metadata = {
  title: "Membership — Topezia",
  description: "Basic is free — honest matching, resume builder, career score. Premium adds the AI coaching layer.",
  alternates: { canonical: "/pricing" },
};

const INK = "#1a1a2e";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const GRAD = "linear-gradient(135deg,#6366F1,#8B5CF6)";

const BASIC = [
  "AI-matched job & project feed, honestly scored",
  "Resume Builder — 7 designed templates, PDF export",
  "AI Career Score with the full counted breakdown",
  "Public profile, portfolio, publications",
  "Recommendations & reviews from real people",
  "Email alerts for your market",
];

const PREMIUM = [
  "Everything in Basic",
  "AI Career Coach — a written plan to raise your score",
  "Unlimited AI resume writing & tailoring",
  "Deep market roadmap — every gap, not just the top ones",
  "Priority support",
];

export default async function PricingPage({ searchParams }: { searchParams: { upgraded?: string } }) {
  // null until Stripe is fully configured AND the price is readable — the
  // page falls back to the honest "Not on sale yet" in every failure mode.
  const price = await getPremiumPrice();
  return (
    <main style={{ background: "#F7F8FB", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-jakarta), sans-serif" }}>
      <SiteNav />
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 70px", width: "100%", flex: 1 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.6px", margin: 0, color: INK, textAlign: "center", fontFamily: "var(--font-sora), sans-serif" }}>Membership</h1>
        <p style={{ fontSize: 14.5, color: MUTED, textAlign: "center", margin: "12px auto 36px", maxWidth: 520, lineHeight: 1.65 }}>
          Two tiers, no tricks. What&apos;s computed from data is free forever; what costs us AI to run is Premium.
        </p>

        {searchParams.upgraded === "1" && (
          <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", borderRadius: 12, padding: "13px 18px", fontSize: 13.5, fontWeight: 600, textAlign: "center", margin: "0 auto 26px", maxWidth: 560, lineHeight: 1.55 }}>
            Payment received — thank you! Premium activates on your account within a minute.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 22 }}>
          <section style={S.card}>
            <h2 style={S.tier}>Basic</h2>
            <div style={S.price}>Free<span style={S.priceSub}> — forever</span></div>
            <ul style={S.ul}>{BASIC.map((f) => <li key={f} style={S.li}>✓ {f}</li>)}</ul>
            <Link href="/onboard" style={S.btnGhost}>Start free →</Link>
          </section>

          <section style={{ ...S.card, border: "2px solid #6366F1", position: "relative" }}>
            <span style={S.badge}>{price ? "Most complete" : "Coming soon"}</span>
            <h2 style={S.tier}>Premium</h2>
            {price ? (
              <div style={S.price}>{formatPrice(price)}</div>
            ) : (
              <div style={S.price}>Not on sale yet</div>
            )}
            <ul style={S.ul}>{PREMIUM.map((f) => <li key={f} style={S.li}>✓ {f}</li>)}</ul>
            {price ? (
              <UpgradeButton />
            ) : (
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginTop: "auto", paddingTop: 8 }}>
                During early access <b>everything is free</b> — including most of this list.
                When Premium launches, early members get first pricing. No card, no countdown timers.
              </div>
            )}
          </section>
        </div>

        <p style={{ fontSize: 12.5, color: MUTED, textAlign: "center", marginTop: 30, lineHeight: 1.6 }}>
          Employers: posting jobs and projects is <Link href="/employer" style={{ color: "#4f46e5", fontWeight: 700 }}>free while we grow</Link>.
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, padding: "28px 26px", display: "flex", flexDirection: "column" },
  tier: { fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#6366F1", margin: 0 },
  price: { fontSize: 30, fontWeight: 800, color: INK, margin: "10px 0 18px", letterSpacing: "-0.5px" },
  priceSub: { fontSize: 14, fontWeight: 600, color: MUTED },
  ul: { listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 10 },
  li: { fontSize: 13.5, color: "#374151", lineHeight: 1.5 },
  btnGhost: { marginTop: "auto", background: GRAD, color: "#fff", borderRadius: 11, padding: "12px 20px", fontSize: 14, fontWeight: 700, textDecoration: "none", textAlign: "center" },
  badge: { position: "absolute", top: -12, right: 20, background: GRAD, color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 12px" },
};
