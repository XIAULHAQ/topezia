"use client";

/**
 * The free-AI-chatbot landing page, built to the .dc.html design.
 *
 * Client-side because four things move: the hero chat plays itself out a
 * message at a time, the demo has four tabs, the FAQ is an accordion, and the
 * install snippet copies. Everything else is static markup with the design's
 * own values — spacing, sizes and colours are taken from the source rather
 * than approximated, since "close enough" on a landing page reads as sloppy.
 *
 * PRICES ARE NOT IN HERE. The design hardcodes $39 and $129; those come from
 * Stripe at render time and arrive as props, because a page that advertises a
 * price we don't charge is worse than a page that looks slightly different.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { hasAuthCookie } from "@/lib/auth/session-cookie";
import AccountMenu from "@/app/_components/AccountMenu";
import { Icon, type IconName } from "./icons";
import { FAQS, type PlanCard } from "./content";

const C1 = "#8B5CF6";
const C2 = "#3B82F6";
const GRAD = `linear-gradient(135deg,${C1},${C2})`;
const INK = "#0F172A";
const SLATE = "#334155";
const MUT = "#64748B";
const LINE = "#E2E8F0";
const BG = "#F8FAFC";
const NIGHT = "#0B1120";

const WRAP: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: "72px 24px" };
const EYEBROW: CSSProperties = {
  display: "inline-block", fontSize: 11.5, fontWeight: 700, letterSpacing: "1.8px",
  textTransform: "uppercase", color: C1,
};
const H2: CSSProperties = { margin: "12px 0 0", fontSize: 34, fontWeight: 800, letterSpacing: "-1px", textWrap: "balance" };

/* ── the chat mock, shared by the hero and the demo ─────────────────────── */

type Msg = {
  side: "in" | "out";
  text: string;
  source?: string;
  product?: { name: string; price: string };
  card?: { title: string; sub: string; fields: string[] };
};

function Bubble({ m, size }: { m: Msg; size: "hero" | "demo" }) {
  const out = m.side === "out";
  const hero = size === "hero";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start", gap: 5, animation: "scin .35s ease both" }}>
      {m.text && (
        <span style={{
          maxWidth: hero ? "86%" : "88%",
          background: out ? "#fff" : GRAD,
          color: out ? INK : "#fff",
          border: `1px solid ${out ? LINE : "transparent"}`,
          borderRadius: out ? "15px 15px 4px 15px" : "15px 15px 15px 4px",
          padding: hero ? "11px 15px" : "11px 14px",
          fontSize: hero ? 12.8 : 12.6,
          lineHeight: 1.6,
          textWrap: "pretty",
          boxShadow: out ? "0 2px 8px rgba(15,23,42,.05)" : "0 8px 20px rgba(99,102,241,.22)",
        }}>{m.text}</span>
      )}
      {m.source && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600,
          color: C1, background: "#F5F3FF", border: "1px solid #E9D5FF", borderRadius: 6, padding: "3px 8px",
        }}>
          <Icon n="link" s={11} />{m.source}
        </span>
      )}
      {m.product && <ProductCard product={m.product} width={hero ? "86%" : "92%"} />}
      {m.card && <LeadCard card={m.card} />}
    </div>
  );
}

function ProductCard({ product, width }: { product: { name: string; price: string }; width: string }) {
  return (
    <span style={{ width, border: `1px solid ${LINE}`, background: "#fff", borderRadius: 13, padding: 12, display: "flex", gap: 11, alignItems: "center" }}>
      <span style={{ flex: "none", width: 46, height: 46, borderRadius: 10, background: "#F1F5F9", display: "grid", placeItems: "center", overflow: "hidden", color: "#CBD5E1" }}>
        <Icon n="box" s={20} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{product.name}</b>
        <span style={{ display: "block", fontSize: 11, color: MUT, marginTop: 3 }}>From {product.price}</span>
        <span style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <span style={{ background: GRAD, color: "#fff", borderRadius: 7, padding: "5px 10px", fontSize: 10.5, fontWeight: 700 }}>Small · £285</span>
          <span style={{ border: `1px solid ${LINE}`, color: SLATE, borderRadius: 7, padding: "5px 10px", fontSize: 10.5, fontWeight: 600 }}>Large · £340</span>
        </span>
      </span>
    </span>
  );
}

function LeadCard({ card }: { card: { title: string; sub: string; fields: string[] } }) {
  return (
    <span style={{ width: "92%", border: `1px solid ${LINE}`, background: "#fff", borderRadius: 13, padding: "14px 15px" }}>
      <b style={{ display: "block", fontSize: 12.3, fontWeight: 700 }}>{card.title}</b>
      <span style={{ display: "block", fontSize: 11, color: MUT, lineHeight: 1.55, marginTop: 5 }}>{card.sub}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
        {card.fields.map((f) => (
          <span key={f} style={{ display: "block", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 11px", fontSize: 11, color: "#94A3B8" }}>{f}</span>
        ))}
      </span>
      <span style={{ display: "flex", gap: 7, marginTop: 11 }}>
        <span style={{ flex: 1, textAlign: "center", background: GRAD, color: "#fff", borderRadius: 8, padding: 8, fontSize: 11, fontWeight: 700 }}>Save my details</span>
        <span style={{ textAlign: "center", border: `1px solid ${LINE}`, color: SLATE, borderRadius: 8, padding: "8px 14px", fontSize: 11, fontWeight: 600 }}>Not now</span>
      </span>
    </span>
  );
}

/* ── page data, straight from the design ────────────────────────────────── */

const HERO_SCRIPT: Msg[] = [
  { side: "in", text: "Hi — I'm the Harbour & Pine assistant. Ask me anything about our furniture, delivery or an order you've placed." },
  { side: "out", text: "do you deliver to the highlands?" },
  { side: "in", text: "We do — mainland Highland postcodes are £45 and take about a week longer than the rest of the UK. Islands are quoted separately.", source: "/delivery" },
  { side: "out", text: "and is the Lowbank in stock?" },
  { side: "in", text: "Both sizes are in stock and ship in three days. The buttons below go straight to checkout.", product: { name: "Lowbank Coffee Table — Solid Oak", price: "£285.00" } },
];

const TABS = {
  answers: {
    label: "Answers from your site", icon: "globe" as IconName, status: "Answering from your pages",
    title: "Every answer comes from your own website",
    body: "It reads your pages the way a new employee would and shows which page each answer came from, so anyone can check it. When your site does not cover something, it says so and offers the message form instead of inventing a price or promising a date you never agreed to.",
    points: ["Cites the page it answered from", "Says “I don't know” instead of guessing", "Replies in the visitor's language — seven of them", "Answers you write by hand outrank your pages, even after a re-scan"],
    msgs: [
      { side: "out", text: "what's the lead time on a made-to-order sideboard?" },
      { side: "in", text: "Made-to-order pieces are eight to ten weeks from the day the design is signed off. Stock pieces ship in three days.", source: "/made-to-order" },
      { side: "out", text: "and can you do it in walnut instead of oak?" },
      { side: "in", text: "I don't have that written down, so I don't want to guess. Leave your email and the team will come back to you on it directly." },
    ] as Msg[],
  },
  leads: {
    label: "Captures leads", icon: "user" as IconName, status: "Collecting details",
    title: "It asks who it is talking to — and takes the answer however it arrives",
    body: "After the first answer it asks for a name, email and phone. It is an invite, not a gate: the “Not now” genuinely works and it keeps answering either way. Anyone who fills it in becomes a lead in your inbox immediately, with their real question as the message.",
    points: ["Details typed mid-sentence count too — nothing is lost", "Opens itself once per visit, never twice", "Unlimited leads on every plan, including free", "Your opening line, your hours, your chime — or silence"],
    msgs: [
      { side: "out", text: "do you make the oak dining table in a 2.4m length?" },
      { side: "in", text: "Our oak tables are listed at 1.8m and 2.1m. Anything longer is made to order, so I can't quote a 2.4m from the page — what's it for?" },
      { side: "in", text: "", card: { title: "Who am I talking to?", sub: "So the team can follow up if we get cut off. We'll only use it to reply.", fields: ["Your name (optional)", "Email — the reply goes here", "Phone (optional)"] } },
    ] as Msg[],
  },
  sell: {
    label: "Sells your products", icon: "cart" as IconName, status: "Shopping assistant",
    title: "It sells, and it sends them to your checkout",
    body: "On a WooCommerce or Shopify site it shows the matching products as proper cards, with a button per variant that drops the item into the basket and takes the customer straight to your checkout — already filled in. They pay you, in your shop, exactly as they do today.",
    points: ["Prices only ever come from the product's own price field", "When someone is ready to buy, it stops interviewing them", "Mark a deal won and it shows what chat actually brought in", "The money never touches Topezia"],
    msgs: [
      { side: "out", text: "i need a coffee table under £400, something low" },
      { side: "in", text: "The Lowbank is our lowest at 32cm and sits under that comfortably. Both sizes are in stock — the buttons below go straight to checkout.", product: { name: "Lowbank Coffee Table — Solid Oak", price: "£285.00" } },
    ] as Msg[],
  },
  orders: {
    label: "Tracks orders", icon: "truck" as IconName, status: "Answers order questions",
    title: "“Where is my order?” — answered, without you",
    body: "Connect WooCommerce, Shopify or BigCommerce with a read-only key and the chat answers order questions from your own records: status, when it was placed, the carrier and the tracking number. It reads orders and never changes them, and it never guesses a delivery date.",
    points: ["Order number AND email or postcode before it says anything", "Never looks up an order from a name or phone number", "Off until you connect a store and switch it on", "Wrong key fails on your settings page, not in front of a customer"],
    msgs: [
      { side: "out", text: "where's my order? #1042" },
      { side: "in", text: "I can look that up — what's the email address or postcode on the order?" },
      { side: "out", text: "dana@example.com" },
      { side: "in", text: "Order #1042 was placed on 25 July and shipped on the 28th with DPD. Tracking number 9400111899223 — the link is on your dispatch email." },
    ] as Msg[],
  },
};
type TabKey = keyof typeof TABS;

const PLATFORMS: { name: string; icon: IconName }[] = [
  { name: "WordPress", icon: "book" }, { name: "Shopify", icon: "cart" }, { name: "WooCommerce", icon: "cart" },
  { name: "BigCommerce", icon: "box" }, { name: "Webflow", icon: "layers" }, { name: "Any HTML site", icon: "code" },
];

const STEPS: { n: string; title: string; body: string; icon: IconName }[] = [
  { n: "1", title: "Give it your address", body: "Type your domain. It reads your site the way a new employee would — pages, prices, policies, products — and remembers what it found.", icon: "globe" },
  { n: "2", title: "Paste one line", body: "A single script tag, or the WordPress plugin if that's easier. Nothing else changes, and the chat runs in its own frame so it can't break your layout.", icon: "code" },
  { n: "3", title: "Answer your inbox", body: "It handles the questions. You handle the people — the ones who left their details, in one inbox, with the transcript and a short brief already written.", icon: "inbox" },
];

const COMMERCE: { title: string; body: string; icon: IconName }[] = [
  { title: "Product cards, not links", body: "Matching products appear as cards with a button per variant — size, colour, finish — pulled from your store, priced from the product's own price field.", icon: "cart" },
  { title: "Straight into your checkout", body: "The button drops the item into the customer's basket and hands them to your checkout, already filled in. They pay you, in your shop.", icon: "box" },
  { title: "Order status on request", body: "Status, order date, carrier and tracking number — read from your store with a read-only key. It never changes an order and never guesses a delivery date.", icon: "truck" },
  { title: "Revenue you can see", body: "Mark a conversation won and type what it was worth. The chat then shows what it has actually brought in — never an estimate.", icon: "chart" },
];

const CONTROLS: { title: string; body: string; icon: IconName }[] = [
  { title: "Your colour", body: "Bubble, buttons and replies in your brand colour, on paid plans.", icon: "palette" },
  { title: "Your logo, round", body: "Your company mark sits in the chat header.", icon: "user" },
  { title: "Your opening line", body: "Write it yourself, or let the chat name whatever page they're on.", icon: "mail" },
  { title: "Open by itself — or not", body: "After a pause you set, a deep scroll, or a move to leave. Once per visit.", icon: "bell" },
  { title: "Chime, or silence", body: "A soft two-note chime when it opens itself. Off in one click.", icon: "sound" },
  { title: "Ask for details — or not", body: "The contact card after the first answer, on or off.", icon: "inbox" },
  { title: "Your hours", body: "Outside them it says plainly that nobody's there and when you're back.", icon: "clock" },
  { title: "Teach it answers", body: "Anything your site doesn't spell out. What you write wins, and re-scanning never erases it.", icon: "book" },
  { title: "Voice and languages", body: "Visitors can speak instead of type, in seven languages, where the browser supports it.", icon: "mic" },
  { title: "Several websites", body: "Studio runs up to ten, each with its own answers, colour and stats.", icon: "layers" },
  { title: "Weekly digest", body: "One email on Mondays — what people asked, what your site couldn't answer. Or none.", icon: "chart" },
  { title: "Turn it off", body: "One switch. The chat disappears from your site; everything it collected stays yours.", icon: "power" },
];

const NOPE: { t: string; b: string }[] = [
  { t: "It won't invent a price", b: "If the number isn't on your site or in an answer you wrote, it says it doesn't know and passes you the person." },
  { t: "It won't promise a delivery date", b: "Even when it can see the tracking. It reports what the courier says and stops there." },
  { t: "It won't take payment", b: "Checkout happens in your shop, on your account. Topezia never handles the money." },
  { t: "It won't pretend someone is there", b: "Outside your hours it says so. If it has no measured reply time, it claims none." },
  { t: "It won't look up an order from a name", b: "Or a phone number. Those aren't secrets, and neither is an order number on its own." },
  { t: "It won't fake a number", b: "Leads, won deals and revenue only ever count what actually happened, or what you typed in yourself." },
];

const FOOTER = [
  { head: "Product", links: [{ label: "Find jobs", href: "/jobs" }, { label: "Freelance projects", href: "/projects" }, { label: "AI Career Coach", href: "/coach" }, { label: "Resume builder", href: "/resume" }] },
  { head: "Employers", links: [{ label: "AI chatbot for websites", href: "/free-ai-chatbot" }, { label: "Site chat pricing", href: "/pricing/business" }, { label: "Post a role", href: "/waitlist" }, { label: "Your inbox", href: "/employer/inquiries" }] },
  { head: "Company", links: [{ label: "About", href: "/about" }, { label: "Blog", href: "/blog" }, { label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] },
];

const SNIPPET = `<script src="https://www.topezia.com/widget.js" data-topezia="your-site-key" async></script>`;

/* ── the page ───────────────────────────────────────────────────────────── */

export default function ChatbotLanding({ plans, badgeOff }: { plans: PlanCard[]; badgeOff: string | null }) {
  // The hero chat types itself out, one message every 1.8s, looping.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 6), 1800);
    return () => clearInterval(t);
  }, []);
  const [tab, setTab] = useState<TabKey>("answers");
  const [open, setOpen] = useState(0);
  const [copied, setCopied] = useState(false);
  /**
   * This page is public and statically cached, so the session is a
   * client-side question. It used to show a bare "Sign in" link to everyone,
   * signed-in members included. Cookie first so the right bar paints on the
   * first frame, then the real check — see lib/auth/session-cookie.ts.
   */
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    if (hasAuthCookie()) setAuthed(true);
    createClient().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session))).catch(() => {});
  }, []);

  const shown = Math.min(HERO_SCRIPT.length, step + 1);
  const t = TABS[tab];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sora), system-ui, sans-serif", color: INK, background: "#fff" }}>
      <style>{`
        @keyframes scfloat{0%,100%{transform:translate(0,0)}50%{transform:translate(20px,-16px)}}
        @keyframes scblink{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
        @keyframes scin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fac-nav{display:flex}
        #fac-hero{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr)}
        #fac-demo{grid-template-columns:minmax(0,1fr) 400px}
        #fac-steps,#fac-pricing,#fac-ctrl,#fac-nope{grid-template-columns:repeat(3,minmax(0,1fr))}
        .fac-link:hover{color:${C1}}
        .fac-card:hover{border-color:#C7D2FE;transform:translateY(-2px)}
        @media (max-width:1040px){
          #fac-hero,#fac-demo{grid-template-columns:minmax(0,1fr)}
          .fac-nav{display:none}
          #fac-ctrl,#fac-nope{grid-template-columns:repeat(2,minmax(0,1fr))}
          #fac-pricing{grid-template-columns:minmax(0,1fr)}
        }
        @media (max-width:680px){#fac-steps,#fac-ctrl,#fac-nope{grid-template-columns:minmax(0,1fr)}}
      `}</style>

      {/* ── header ─────────────────────────────────────────────────────── */}
      <header style={{ background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: INK, textDecoration: "none" }}>
            <svg width="32" height="24" viewBox="0 0 36 26" aria-hidden>
              <defs><linearGradient id="facg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C1} /><stop offset="1" stopColor={C2} /></linearGradient></defs>
              <circle cx="10.5" cy="13" r="7.2" stroke="url(#facg)" strokeWidth="4.2" fill="none" />
              <circle cx="25.5" cy="13" r="7.2" stroke="url(#facg)" strokeWidth="4.2" fill="none" />
            </svg>
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span>
          </Link>
          <div style={{ flex: 1 }} />
          <div className="fac-nav" style={{ alignItems: "center", gap: 2 }}>
            {[["How it works", "#how"], ["See it work", "#demo"], ["Ecommerce", "#ecommerce"], ["Pricing", "#pricing"], ["FAQ", "#faq"]].map(([label, href]) => (
              <a key={href} href={href} className="fac-link" style={{ fontSize: 13, fontWeight: 600, color: SLATE, padding: "9px 11px", textDecoration: "none" }}>{label}</a>
            ))}
          </div>
          {/* "Get it free" stays in both states — it is the point of the page,
              and it lands on the widget setup either way. Only the sign-in
              link is wrong for someone already signed in. */}
          {authed
            ? <AccountMenu />
            : <Link href="/login" className="fac-link" style={{ fontSize: 13, fontWeight: 600, color: SLATE, padding: "9px 12px", textDecoration: "none" }}>Sign in</Link>}
          <Link href="/employer/widget" style={{ background: GRAD, color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, boxShadow: "0 5px 14px rgba(99,102,241,.3)", textDecoration: "none" }}>Get it free</Link>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section style={{ background: NIGHT, color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 480px at 78% -8%,rgba(139,92,246,.34),transparent 62%),radial-gradient(760px 420px at 6% 108%,rgba(59,130,246,.24),transparent 60%)" }} />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px)", backgroundSize: "64px 64px", maskImage: "radial-gradient(760px 460px at 50% 30%,#000,transparent 78%)", WebkitMaskImage: "radial-gradient(760px 460px at 50% 30%,#000,transparent 78%)" }} />
          <div id="fac-hero" style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "66px 24px 74px", display: "grid", gap: 52, alignItems: "center" }}>
            <div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.07)", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, letterSpacing: ".3px", color: "#DDD6FE" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />
                Free forever for one website · no card
              </span>
              <h1 style={{ margin: "20px 0 0", fontSize: 53, lineHeight: 1.06, fontWeight: 800, letterSpacing: "-1.8px", textWrap: "balance" }}>
                Free AI chatbot for your website
              </h1>
              <p style={{ margin: "20px 0 0", fontSize: 17, lineHeight: 1.7, color: "#B7C0D8", maxWidth: 560, textWrap: "pretty" }}>
                Topezia Site Chat reads your own pages, then answers your visitors from them — accurately, in their language,
                with the source shown. It captures leads, sells your products and tracks orders, so an{" "}
                <b style={{ color: "#fff", fontWeight: 600 }}>AI chatbot for your ecommerce website</b> takes about five
                minutes to install and one line of code.
              </p>
              <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginTop: 28 }}>
                <Link href="/employer/widget" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: GRAD, color: "#fff", borderRadius: 12, padding: "14px 26px", fontSize: 14.5, fontWeight: 700, boxShadow: "0 12px 30px rgba(99,102,241,.4)", textDecoration: "none" }}>
                  Add the free chatbot <Icon n="arrow" s={16} />
                </Link>
                <a href="#demo" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", borderRadius: 12, padding: "14px 24px", fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}>
                  <Icon n="play" s={15} />See it answer
                </a>
              </div>
              <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 34, paddingTop: 26, borderTop: "1px solid rgba(255,255,255,.1)" }}>
                {[{ big: "5 min", label: "From paste to live" }, { big: "$0", label: "Free forever, one site" }, { big: "∞", label: "Leads on every plan" }].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.6px" }}>{s.big}</div>
                    <div style={{ fontSize: 11.5, color: "#8794B3", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -40, right: -20, width: 240, height: 240, borderRadius: "50%", background: "rgba(139,92,246,.22)", filter: "blur(2px)", animation: "scfloat 12s ease-in-out infinite" }} />
              <div style={{ position: "relative", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 80px rgba(2,6,23,.55)", color: INK }}>
                <div style={{ background: GRAD, padding: "15px 18px", display: "flex", alignItems: "center", gap: 11, color: "#fff" }}>
                  <span style={{ flex: "none", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,.22)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>HP</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>Harbour &amp; Pine</b>
                    <span style={{ display: "block", fontSize: 11, opacity: .85, marginTop: 2 }}>Usually replies within an hour</span>
                  </span>
                  <span style={{ opacity: .8, fontSize: 15 }}>✕</span>
                </div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 11, background: BG, minHeight: 300 }}>
                  {HERO_SCRIPT.slice(0, shown).map((m, i) => <Bubble key={i} m={m} size="hero" />)}
                  {shown < HERO_SCRIPT.length && (
                    <span style={{ alignSelf: "flex-start", background: "#fff", border: `1px solid ${LINE}`, borderRadius: "14px 14px 14px 4px", padding: "12px 16px" }}>
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {[0, 1, 2].map((i) => (
                          <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#94A3B8", animation: `scblink 1.1s ${i * 0.18}s infinite` }} />
                        ))}
                      </span>
                    </span>
                  )}
                </div>
                <div style={{ borderTop: `1px solid ${LINE}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, background: "#fff" }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: "#94A3B8" }}>Ask a question…</span>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: GRAD, color: "#fff", display: "grid", placeItems: "center" }}><Icon n="arrow" s={16} /></span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── platforms ────────────────────────────────────────────────── */}
        <section style={{ borderBottom: `1px solid ${LINE}`, background: "#fff" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 24px", display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", color: "#94A3B8" }}>Works on</span>
            {PLATFORMS.map((p) => (
              <span key={p.name} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#475569" }}>
                <Icon n={p.icon} s={16} />{p.name}
              </span>
            ))}
          </div>
        </section>

        {/* ── how it works ─────────────────────────────────────────────── */}
        <section id="how" style={{ background: BG, borderBottom: `1px solid ${LINE}`, scrollMarginTop: 66 }}>
          <div style={WRAP}>
            <span style={EYEBROW}>Setup</span>
            <h2 style={{ ...H2, fontSize: 36, letterSpacing: "-1.1px", maxWidth: 760 }}>Your website chatbot is live in about five minutes</h2>
            <p style={{ margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.75, color: SLATE, maxWidth: 660, textWrap: "pretty" }}>
              No training data, no scripts, no flow charts. The work you would normally do to set up a chatbot is the work it does for you.
            </p>
            <div id="fac-steps" style={{ display: "grid", gap: 16, marginTop: 38 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, padding: "26px 24px", position: "relative", overflow: "hidden" }}>
                  <span style={{ position: "absolute", top: -14, right: 6, fontSize: 82, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-4px" }}>{s.n}</span>
                  <span style={{ position: "relative", width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#F5F3FF,#EFF6FF)", border: "1px solid #E9D5FF", color: C1, display: "grid", placeItems: "center" }}>
                    <Icon n={s.icon} s={19} />
                  </span>
                  <b style={{ position: "relative", display: "block", fontSize: 16.5, fontWeight: 700, marginTop: 16, letterSpacing: "-0.3px" }}>{s.title}</b>
                  <p style={{ position: "relative", margin: "9px 0 0", fontSize: 13.5, lineHeight: 1.7, color: SLATE, textWrap: "pretty" }}>{s.body}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, background: NIGHT, borderRadius: 16, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "#7C89A8" }}>The one line</span>
              <code style={{ flex: 1, minWidth: 260, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.5, color: "#A5F3FC", overflowX: "auto", whiteSpace: "nowrap" }}>{SNIPPET}</code>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(SNIPPET).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}
                style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", color: "#E2E8F0", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </section>

        {/* ── interactive demo ─────────────────────────────────────────── */}
        <section id="demo" style={{ background: "#fff", borderBottom: `1px solid ${LINE}`, scrollMarginTop: 66 }}>
          <div style={WRAP}>
            <span style={EYEBROW}>See it work</span>
            <h2 style={{ ...H2, fontSize: 36, letterSpacing: "-1.1px", maxWidth: 800 }}>Four jobs your AI chat widget does on its own</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 26 }}>
              {(Object.keys(TABS) as TabKey[]).map((k) => {
                const on = k === tab;
                return (
                  <button key={k} type="button" onClick={() => setTab(k)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    border: `1px solid ${on ? "transparent" : LINE}`, background: on ? GRAD : "#fff",
                    color: on ? "#fff" : SLATE, borderRadius: 999, padding: "10px 18px", fontSize: 13,
                    fontWeight: 600, cursor: "pointer", boxShadow: on ? "0 8px 20px rgba(99,102,241,.3)" : "none",
                    fontFamily: "inherit",
                  }}>
                    <Icon n={TABS[k].icon} s={15} />{TABS[k].label}
                  </button>
                );
              })}
            </div>
            <div id="fac-demo" style={{ display: "grid", gap: 32, marginTop: 30, alignItems: "start" }}>
              <div style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 20, padding: "34px 34px 30px" }}>
                <h3 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-0.7px", textWrap: "balance" }}>{t.title}</h3>
                <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.78, color: SLATE, textWrap: "pretty" }}>{t.body}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 22, paddingTop: 20, borderTop: `1px solid ${LINE}` }}>
                  {t.points.map((pt) => (
                    <span key={pt} style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: 13.3, lineHeight: 1.65, color: SLATE }}>
                      <span style={{ flex: "none", width: 19, height: 19, borderRadius: 6, background: "#ECFDF5", color: "#059669", display: "grid", placeItems: "center", marginTop: 1 }}>
                        <Icon n="tick" s={12} w={2.6} />
                      </span>
                      <span style={{ flex: 1, textWrap: "pretty" }}>{pt}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 50px rgba(15,23,42,.09)" }}>
                <div style={{ background: GRAD, padding: "14px 17px", display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.22)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>HP</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 12.8, fontWeight: 700 }}>Harbour &amp; Pine</b>
                    <span style={{ display: "block", fontSize: 10.5, opacity: .85, marginTop: 2 }}>{t.status}</span>
                  </span>
                  <span style={{ opacity: .8, fontSize: 14 }}>✕</span>
                </div>
                <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 10, background: BG, minHeight: 330 }}>
                  {t.msgs.map((m, i) => <Bubble key={`${tab}-${i}`} m={m} size="demo" />)}
                </div>
                <div style={{ borderTop: `1px solid ${LINE}`, padding: "11px 15px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 12, color: "#94A3B8" }}>Ask a question…</span>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: GRAD, color: "#fff", display: "grid", placeItems: "center" }}><Icon n="arrow" s={16} /></span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── ecommerce ────────────────────────────────────────────────── */}
        <section id="ecommerce" style={{ background: NIGHT, color: "#fff", position: "relative", overflow: "hidden", scrollMarginTop: 66 }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(760px 400px at 85% 0%,rgba(59,130,246,.28),transparent 62%),radial-gradient(640px 380px at 0% 100%,rgba(139,92,246,.22),transparent 60%)" }} />
          <div style={{ ...WRAP, position: "relative" }}>
            <span style={{ ...EYEBROW, color: "#C4B5FD" }}>Ecommerce</span>
            <h2 style={{ ...H2, fontSize: 36, letterSpacing: "-1.1px", maxWidth: 820 }}>An AI chatbot for ecommerce websites that sells and then tracks the order</h2>
            <p style={{ margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.75, color: "#B7C0D8", maxWidth: 720, textWrap: "pretty" }}>
              Connect Shopify, WooCommerce or BigCommerce with a read-only key. The chatbot recommends the right product,
              drops it into your basket, sends the shopper to your checkout — and afterwards answers “where is my order?”
              from your own records. The money never touches Topezia.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16, marginTop: 36 }}>
              {COMMERCE.map((c) => (
                <div key={c.title} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, padding: "24px 22px" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(139,92,246,.2)", border: "1px solid rgba(196,181,253,.3)", color: "#DDD6FE", display: "grid", placeItems: "center" }}>
                    <Icon n={c.icon} s={18} />
                  </span>
                  <b style={{ display: "block", fontSize: 15.5, fontWeight: 700, marginTop: 15, letterSpacing: "-0.2px" }}>{c.title}</b>
                  <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.7, color: "#9AA6C4", textWrap: "pretty" }}>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── handover ─────────────────────────────────────────────────── */}
        <section style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ ...WRAP, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 44, alignItems: "center" }}>
            <div>
              <span style={EYEBROW}>Handover</span>
              <h2 style={H2}>You get the whole conversation, not a notification</h2>
              <p style={{ margin: "14px 0 0", fontSize: 14.8, lineHeight: 1.78, color: SLATE, textWrap: "pretty" }}>
                The moment someone leaves their details the email arrives — their message in full, how to reach them, and
                every turn of the chat, both sides. Above it sits a short brief: what they want, budget and timing if they
                said them, and the questions the chat never got to ask. Nothing is inferred.
              </p>
              <p style={{ margin: "14px 0 0", fontSize: 14.8, lineHeight: 1.78, color: SLATE, textWrap: "pretty" }}>
                The same thread lands in your Topezia inbox. Reply there and it reaches them by email — or straight into
                the chat if they still have it open. Every Monday you get one digest: what people asked, what your site
                could not answer, who is still waiting.
              </p>
              <Link href="/employer/inquiries" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, fontSize: 13.5, fontWeight: 700, color: C1, textDecoration: "none" }}>
                Look inside the inbox <Icon n="arrow" s={16} />
              </Link>
            </div>
            <div style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, boxShadow: "0 20px 50px rgba(15,23,42,.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, paddingBottom: 14, borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.4px" }}>topezia</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: MUT }}>New message · just now</span>
              </div>
              <b style={{ display: "block", fontSize: 15, fontWeight: 700, marginTop: 14 }}>Dana Whitfield wrote about Website chat</b>
              <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.7, color: SLATE }}>
                “do you make the oak dining table in a 2.4m length? we&apos;re doing a long farmhouse table for a barn conversion, seats ten”
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {["dana@example.com", "0161 496 0142"].map((v) => (
                  <span key={v} style={{ background: "#EEF2FF", color: "#4F46E5", borderRadius: 7, padding: "5px 11px", fontSize: 11, fontWeight: 600 }}>{v}</span>
                ))}
              </div>
              <div style={{ marginTop: 16, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 13, padding: "15px 16px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: C1 }}>What they&apos;re after</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 11 }}>
                  {[["Wants", "2.4m oak table, seats ten"], ["Timing", "Before the end of October"], ["To ask", "Finish · delivery address · chairs too?"]].map(([k, v]) => (
                    <span key={k} style={{ display: "flex", gap: 10, fontSize: 12.3, color: SLATE }}>
                      <b style={{ flex: "none", width: 62, color: MUT, fontWeight: 600 }}>{k}</b><span style={{ flex: 1 }}>{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── controls ─────────────────────────────────────────────────── */}
        <section style={{ background: BG, borderBottom: `1px solid ${LINE}` }}>
          <div style={WRAP}>
            <span style={EYEBROW}>Your settings</span>
            <h2 style={H2}>What you control</h2>
            <p style={{ margin: "13px 0 0", fontSize: 15, color: SLATE, maxWidth: 620 }}>All of it from one page, all of it changeable at any time.</p>
            <div id="fac-ctrl" style={{ display: "grid", gap: 12, marginTop: 32 }}>
              {CONTROLS.map((c) => (
                <div key={c.title} className="fac-card" style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 20px", display: "flex", gap: 13, alignItems: "flex-start", transition: "border-color .2s,transform .2s" }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: 10, background: "#F5F3FF", color: C1, display: "grid", placeItems: "center" }}>
                    <Icon n={c.icon} s={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{c.title}</b>
                    <span style={{ display: "block", fontSize: 12.3, color: MUT, lineHeight: 1.6, marginTop: 5, textWrap: "pretty" }}>{c.body}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── guardrails ───────────────────────────────────────────────── */}
        <section style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
          <div style={WRAP}>
            <span style={{ ...EYEBROW, color: "#DC2626" }}>Guardrails</span>
            <h2 style={H2}>What it deliberately doesn&apos;t do</h2>
            <p style={{ margin: "13px 0 0", fontSize: 15, color: SLATE, maxWidth: 620 }}>Worth knowing before you install it, rather than after.</p>
            <div id="fac-nope" style={{ display: "grid", gap: 12, marginTop: 32 }}>
              {NOPE.map((n) => (
                <div key={n.t} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, background: "#FEFEFF" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, background: "#FEF2F2", color: "#DC2626", display: "grid", placeItems: "center" }}>
                      <Icon n="no" s={12} w={2.4} />
                    </span>
                    {n.t}
                  </span>
                  <p style={{ margin: "9px 0 0", fontSize: 12.5, lineHeight: 1.7, color: MUT, textWrap: "pretty" }}>{n.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── pricing ──────────────────────────────────────────────────── */}
        <section id="pricing" style={{ background: BG, borderBottom: `1px solid ${LINE}`, scrollMarginTop: 66 }}>
          <div style={WRAP}>
            <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
              <span style={EYEBROW}>Pricing</span>
              <h2 style={H2}>Start with the free AI chatbot, upgrade only for capacity</h2>
              <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.75, color: SLATE, textWrap: "pretty" }}>
                Leads, your inbox and deal tracking are free forever on every plan. What the paid plans buy is AI capacity —
                how many questions it answers and how much of your site it reads.
              </p>
            </div>
            <div id="fac-pricing" style={{ display: "grid", gap: 16, marginTop: 38, alignItems: "start" }}>
              {plans.map((p) => (
                <div key={p.name} style={{
                  background: p.dark ? NIGHT : "#fff",
                  border: `1px solid ${p.dark ? "rgba(255,255,255,.14)" : LINE}`,
                  borderRadius: 20, padding: "28px 26px", position: "relative",
                  boxShadow: p.dark ? "0 26px 60px rgba(15,23,42,.28)" : "none",
                  color: p.dark ? "#fff" : INK,
                }}>
                  {p.flag && (
                    <span style={{ position: "absolute", top: -11, left: 26, background: GRAD, color: "#fff", borderRadius: 999, padding: "5px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".4px" }}>{p.flag}</span>
                  )}
                  <b style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{p.name}</b>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 12 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-1.6px" }}>{p.price}</span>
                    <span style={{ fontSize: 13, color: p.dark ? "#8794B3" : MUT }}>{p.per}</span>
                  </div>
                  <span style={{ display: "block", fontSize: 11.5, color: p.dark ? "#8794B3" : MUT, marginTop: 5 }}>{p.note}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, paddingTop: 18, borderTop: `1px solid ${p.dark ? "rgba(255,255,255,.12)" : LINE}` }}>
                    {p.feats.map((ft) => (
                      <span key={ft} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.8, lineHeight: 1.6, color: p.dark ? "#C7CEE4" : SLATE }}>
                        <span style={{ flex: "none", width: 17, height: 17, borderRadius: 5, background: p.dark ? "rgba(74,222,128,.16)" : "#ECFDF5", color: p.dark ? "#4ADE80" : "#059669", display: "grid", placeItems: "center", marginTop: 1 }}>
                          <Icon n="tick" s={11} w={2.6} />
                        </span>
                        <span style={{ flex: 1, textWrap: "pretty" }}>{ft}</span>
                      </span>
                    ))}
                  </div>
                  <Link href={p.href} style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 22,
                    background: p.dark ? GRAD : "#fff", border: `1px solid ${p.dark ? "transparent" : "#C7D2FE"}`,
                    color: p.dark ? "#fff" : "#4F46E5", borderRadius: 12, padding: "12px 18px",
                    fontSize: 13.5, fontWeight: 700, textDecoration: "none",
                  }}>{p.cta}</Link>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12.8, color: SLATE }}>
              <span style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "13px 18px", lineHeight: 1.6 }}>
                Run out of AI answers and the chat doesn&apos;t go dark — it keeps taking messages, so you never lose a lead to a limit.{" "}
                <Link href="/pricing/business" style={{ fontWeight: 700, color: C1, textDecoration: "none" }}>Full plan comparison →</Link>
              </span>
              {badgeOff && (
                <span style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", borderRadius: 12, padding: "13px 18px", lineHeight: 1.6 }}>
                  Keep a small “AI chat powered by Topezia” line and save {badgeOff} a month.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── long-form copy ───────────────────────────────────────────── */}
        <section style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "66px 24px" }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", textWrap: "balance" }}>
              Why a free AI chatbot for your website is worth adding this week
            </h2>
            <p style={{ margin: "16px 0 0", fontSize: 14.3, lineHeight: 1.85, color: SLATE, textWrap: "pretty" }}>
              Most visitors who leave a small business website never come back, and almost none of them fill in a contact
              form. A <b style={{ fontWeight: 600, color: INK }}>free AI chatbot for your website</b> closes that gap: it
              answers the delivery question, the lead-time question and the “do you do this in walnut?” question at the
              moment somebody is wondering, instead of a day later by email. Topezia Site Chat reads your existing pages —
              products, prices, policies, FAQs — and replies only from what it found there, quoting the page it used, so
              you get the speed of automation without the risk of an AI chat widget inventing something you never offered.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 14.3, lineHeight: 1.85, color: SLATE, textWrap: "pretty" }}>
              For shops, an <b style={{ fontWeight: 600, color: INK }}>AI chatbot for an ecommerce website</b> has a second
              job: turning the conversation into a sale. Connect Shopify, WooCommerce or BigCommerce and the chatbot
              recommends matching products as cards, sends the shopper to your own checkout with the item already in the
              basket, and afterwards handles order-status questions from your real records — order number plus email or
              postcode, never a name alone. That is the whole after-sales queue that usually lands in a founder&apos;s
              inbox, answered without you.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 14.3, lineHeight: 1.85, color: SLATE, textWrap: "pretty" }}>
              Installing the website chatbot is one line of script or a WordPress plugin, and it runs in its own frame so
              it cannot break your layout. Every visitor who leaves a name, email or phone number — in the contact card or
              simply typed mid-sentence — becomes a lead in your Topezia inbox with the full transcript and a short brief
              attached. Anything your site could not answer is collected for you, and the answers you write by hand
              outrank your pages from then on, including after a re-scan.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 14.3, lineHeight: 1.85, color: SLATE, textWrap: "pretty" }}>
              The free plan covers one website, 200 AI answers a month, 60 scanned pages and unlimited leads, with no card.
              It is the cheapest honest way to find out what your customers are actually asking — and if the AI chatbot
              never earns its place, one switch removes it from your site and everything it collected stays yours.
            </p>
          </div>
        </section>

        {/* ── faq ──────────────────────────────────────────────────────── */}
        <section id="faq" style={{ background: BG, borderBottom: `1px solid ${LINE}`, scrollMarginTop: 66 }}>
          <div style={{ maxWidth: 880, margin: "0 auto", padding: "72px 24px" }}>
            <h2 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-1px", textAlign: "center", textWrap: "balance" }}>
              AI chatbot questions, answered
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
              {FAQS.map(([q, a], i) => {
                const on = open === i;
                return (
                  <div key={q} onClick={() => setOpen(on ? -1 : i)} style={{ background: "#fff", border: `1px solid ${on ? "#C7D2FE" : LINE}`, borderRadius: 14, padding: "20px 22px", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <b style={{ flex: 1, fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.2px", textWrap: "pretty" }}>{q}</b>
                      <span style={{ flex: "none", width: 26, height: 26, borderRadius: 8, background: on ? GRAD : "#F1F5F9", color: on ? "#fff" : MUT, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700 }}>
                        {on ? "−" : "+"}
                      </span>
                    </span>
                    {on && <p style={{ margin: "13px 0 0", fontSize: 13.5, lineHeight: 1.78, color: SLATE, textWrap: "pretty" }}>{a}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── final CTA ────────────────────────────────────────────────── */}
        <section style={{ background: NIGHT, color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 380px at 50% 0%,rgba(139,92,246,.32),transparent 66%)" }} />
          <div style={{ position: "relative", maxWidth: 780, margin: "0 auto", padding: "78px 24px", textAlign: "center" }}>
            <h2 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-1.3px", textWrap: "balance" }}>
              Put a free AI chatbot on your site and see what people ask
            </h2>
            <p style={{ margin: "16px auto 0", fontSize: 15.5, lineHeight: 1.75, color: "#B7C0D8", maxWidth: 600, textWrap: "pretty" }}>
              One website, no card, live in five minutes. You&apos;ll know within a week whether it&apos;s earning its
              place — because it tells you exactly what it was asked and what it brought in.
            </p>
            <div style={{ display: "flex", gap: 11, flexWrap: "wrap", justifyContent: "center", marginTop: 28 }}>
              <Link href="/employer/widget" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: GRAD, color: "#fff", borderRadius: 12, padding: "14px 28px", fontSize: 14.5, fontWeight: 700, boxShadow: "0 12px 30px rgba(99,102,241,.42)", textDecoration: "none" }}>
                Start free <Icon n="arrow" s={16} />
              </Link>
              <Link href="/join" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", borderRadius: 12, padding: "14px 26px", fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}>
                Create an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer ─────────────────────────────────────────────────────── */}
      <footer style={{ background: "#080D19", color: "#8B96B5", padding: "46px 24px 34px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 30, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 260 }}>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</div>
            <div style={{ fontSize: 12, marginTop: 7, lineHeight: 1.7 }}>Infinite potential. Intelligent future.</div>
          </div>
          {FOOTER.map((col) => (
            <div key={col.head} style={{ minWidth: 150 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "#5D6A8A" }}>{col.head}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 13 }}>
                {col.links.map((l) => (
                  <Link key={l.label} href={l.href} style={{ fontSize: 12.5, color: "#8B96B5", textDecoration: "none" }}>{l.label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1180, margin: "30px auto 0", paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 11.5 }}>
          © {new Date().getFullYear()} Topezia. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
