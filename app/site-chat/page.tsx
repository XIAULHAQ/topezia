import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { planCatalogue } from "@/lib/billing/catalogue";
import { PLANS, brandingCouponFor } from "@/lib/billing/plans";
import { billingConfigured, getCoupon } from "@/lib/billing/stripe";
import { ChatFrame, Bot, Visitor, Source, ProductCard, ContactCard, LeadEmail } from "./_mocks";

/**
 * The public page for the site chat.
 *
 * Every claim here has to be one the product actually keeps. Prices come from
 * Stripe at render time, the limits come from the plan table, and the
 * behaviour described is the behaviour in lib/widget — including the parts
 * that are limits rather than features, which are on the page on purpose. A
 * landing page that oversells is a support queue with a delay on it.
 */
export const dynamic = "force-dynamic";

const TITLE = "AI chat for your website — Topezia";
const DESCRIPTION =
  "An AI assistant that reads your own website and answers your visitors from it — captures their details, sends you the whole conversation, sells your products and tracks their orders. Free to start.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/site-chat" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/site-chat" },
};

const n = (v: number) => v.toLocaleString();

/* ── small presentational pieces ─────────────────────────────────────────── */

const H2: CSSProperties = { fontSize: 26, fontWeight: 800, letterSpacing: "-0.6px", margin: "0 0 10px", color: "#0F172A" };
const LEAD: CSSProperties = { fontSize: 15.5, lineHeight: 1.75, color: "#475569", margin: "0 0 18px" };
const BODY: CSSProperties = { fontSize: 14.5, lineHeight: 1.75, color: "#475569", margin: "0 0 14px" };
const EYEBROW: CSSProperties = {
  display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: "#4F46E5", background: "#EEF2FF", borderRadius: 999, padding: "5px 11px", margin: "0 0 14px",
};

function Section({ children, tint = false }: { children: ReactNode; tint?: boolean }) {
  return (
    <section style={{ background: tint ? "#F8FAFC" : "#fff", borderTop: "1px solid #F1F5F9" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 20px" }}>{children}</div>
    </section>
  );
}

/** Prose beside a picture, stacking on a phone. */
function Split({ children, figure, flip = false }: { children: ReactNode; figure: ReactNode; flip?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
      gap: 36, alignItems: "center",
    }}>
      <div style={{ order: flip ? 2 : 1, minWidth: 0 }}>{children}</div>
      <div style={{ order: flip ? 1 : 2, minWidth: 0, display: "flex", justifyContent: "center" }}>{figure}</div>
    </div>
  );
}

function Cta({ href, children, ghost = false }: { href: string; children: ReactNode; ghost?: boolean }) {
  return (
    <Link href={href} style={{
      display: "inline-block", textDecoration: "none", borderRadius: 11, padding: "12px 22px",
      fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
      background: ghost ? "#fff" : "linear-gradient(135deg,#8B5CF6,#3B82F6)",
      color: ghost ? "#334155" : "#fff",
      border: ghost ? "1px solid #E2E8F0" : "none",
    }}>{children}</Link>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "16px 18px" }}>
      <b style={{ display: "block", fontSize: 14, color: "#0F172A", marginBottom: 5 }}>{title}</b>
      <span style={{ fontSize: 13.3, lineHeight: 1.65, color: "#64748B" }}>{children}</span>
    </div>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I have to write the answers myself?",
    a: "No. It reads your website and answers from what is already there. You can override any answer by hand, and what you write wins over the page — including after a re-scan.",
  },
  {
    q: "Will it make things up?",
    a: "It answers only from your own pages and the answers you have written. When your site does not cover something — a price, a lead time, a policy — it says so and offers the visitor the message form rather than guessing.",
  },
  {
    q: "How do I install it?",
    a: "One line of script in your site's HTML, or the Topezia Chat plugin if you run WordPress. Nothing else changes on your site, and the chat runs in its own frame so it cannot interfere with your pages.",
  },
  {
    q: "What happens to the people who talk to it?",
    a: "Anyone who leaves their details lands in your Topezia inbox and in your email, with the whole conversation attached — both sides — plus a short brief of what they are after. You reply from either.",
  },
  {
    q: "Can it take orders?",
    a: "On WooCommerce and Shopify it shows your products with buy buttons that go straight into your own checkout. The money never touches Topezia — the customer pays you, in your shop, exactly as they do today.",
  },
  {
    q: "Can it tell customers where their order is?",
    a: "Yes, on WooCommerce, Shopify and BigCommerce. It asks for the order number AND the email or postcode on the order before it says anything, because an order number on its own could be anyone's.",
  },
  {
    q: "What does it cost?",
    a: "Free for one website, with unlimited leads and no card. Paid plans buy more AI answers, more pages, your own colour and the extras — the full comparison is on the pricing page.",
  },
];

export default async function SiteChatPage() {
  const plans = billingConfigured() ? await planCatalogue() : [];
  const badgeOff = billingConfigured() ? await getCoupon(brandingCouponFor("month")) : null;
  const free = PLANS.FREE;

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
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <SiteNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ background: "linear-gradient(180deg,#F8FAFC,#fff)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "52px 20px 44px" }}>
          <Split
            figure={
              <ChatFrame>
                <Bot>Hi — I&apos;m the Harbour &amp; Pine assistant. Ask me anything, or leave a message and a real person will get back to you.</Bot>
                <Visitor>do you deliver to the highlands?</Visitor>
                <Bot>We do — mainland Highland postcodes are £45 and take about a week longer than the rest of the UK. Anything going to the islands is quoted separately.</Bot>
                <Source label="/delivery" />
              </ChatFrame>
            }
          >
            <span style={EYEBROW}>Site chat</span>
            <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-1.4px", lineHeight: 1.12, margin: "0 0 14px", color: "#0F172A" }}>
              An assistant that has actually read your website
            </h1>
            <p style={{ ...LEAD, fontSize: 16.5 }}>
              It answers your visitors from your own pages, catches the ones who were about to leave, and hands you
              the people worth talking to — with the whole conversation attached. You paste one line of code.
              It does the rest.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <Cta href="/employer/widget">Start free</Cta>
              <Cta href="#pricing" ghost>See pricing</Cta>
            </div>
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
              Free for one website. No card. Unlimited leads on every plan, including the free one.
            </p>
          </Split>
        </div>
      </section>

      {/* ── Three steps ──────────────────────────────────────────────────── */}
      <Section tint>
        <h2 style={H2}>Live in about five minutes</h2>
        <p style={{ ...LEAD, maxWidth: 680 }}>
          There is no training, no script writing and no flow chart to draw. The work you would normally do to set
          up a chatbot is the work it does for you.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
          {[
            { n: "1", t: "Give it your address", d: "Type your domain. It reads your site the way a new employee would — pages, prices, policies, products — and remembers what it found." },
            { n: "2", t: "Paste one line", d: "A single script tag, or the WordPress plugin if that is easier. Nothing else on your site changes, and the chat runs in its own frame so it cannot break your layout." },
            { n: "3", t: "Answer your inbox", d: "It handles the questions. You handle the people — the ones who left their details, in one inbox, with the conversation and a short brief already written." },
          ].map((s) => (
            <div key={s.n} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 20 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)",
                color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, marginBottom: 12,
              }}>{s.n}</div>
              <b style={{ display: "block", fontSize: 15, marginBottom: 6, color: "#0F172A" }}>{s.t}</b>
              <span style={{ fontSize: 13.8, lineHeight: 1.7, color: "#64748B" }}>{s.d}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Grounded answers ─────────────────────────────────────────────── */}
      <Section>
        <Split
          flip
          figure={
            <ChatFrame>
              <Visitor>what&apos;s the lead time on a made-to-order sideboard?</Visitor>
              <Bot>Made-to-order pieces are eight to ten weeks from the day the design is signed off. Stock pieces ship in three days.</Bot>
              <Source label="/made-to-order" />
              <Visitor>and can you do it in walnut instead of oak?</Visitor>
              <Bot>I don&apos;t have that written down, so I don&apos;t want to guess. Leave your email and the team will come back to you on it directly.</Bot>
            </ChatFrame>
          }
        >
          <span style={EYEBROW}>It doesn&apos;t guess</span>
          <h2 style={H2}>Every answer comes from your own website</h2>
          <p style={BODY}>
            It answers from your pages and shows which page it used, so anyone can check it. When your site does not
            cover something, it says so and offers the message form instead of inventing a price or promising a date
            you never agreed to.
          </p>
          <p style={BODY}>
            The awkward questions are the valuable ones. Everything it could not answer is collected for you, and
            anything you answer by hand from then on <strong>outranks your own pages</strong> — including after you
            re-scan the site. Correcting it once makes it stick.
          </p>
          <p style={{ ...BODY, marginBottom: 0 }}>
            It replies in the visitor&apos;s own language — seven of them — whatever language your site is written in,
            and keeps your product names and prices exactly as you wrote them.
          </p>
        </Split>
      </Section>

      {/* ── Opt-in ───────────────────────────────────────────────────────── */}
      <Section tint>
        <Split
          figure={
            <ChatFrame>
              <Visitor>do you make the oak dining table in a 2.4m length?</Visitor>
              <Bot>Our oak tables are listed at 1.8m and 2.1m. Anything longer is made to order, so I can&apos;t quote a 2.4m from the page — what&apos;s it for?</Bot>
              <ContactCard />
            </ChatFrame>
          }
        >
          <span style={EYEBROW}>Opt-in</span>
          <h2 style={H2}>It asks who it is talking to — and takes the answer however it arrives</h2>
          <p style={BODY}>
            After the first answer it asks for a name, email and phone. It is an invite, not a gate: there is a
            &ldquo;Not now&rdquo; that genuinely works, and it keeps answering either way. Anyone who fills it in
            becomes a lead in your inbox immediately, with their real question as the message.
          </p>
          <p style={BODY}>
            Most people ignore the card and simply type their details into the chat instead, because that is where
            the cursor already is. <strong>Those count too.</strong> An email or phone number typed mid-sentence is
            picked up and turned into the same lead, with the same checks — so nobody is lost for answering in the
            wrong box.
          </p>
          <p style={{ ...BODY, marginBottom: 0 }}>
            And it opens itself once per visit — after a pause, a deep scroll, or a move toward the tab bar — with
            an opening line you write, and an optional soft chime. Once per visit, never twice.
          </p>
        </Split>
      </Section>

      {/* ── The email ────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 36, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <span style={EYEBROW}>Handover</span>
            <h2 style={H2}>You get the whole conversation, not a notification</h2>
            <p style={BODY}>
              The moment someone leaves their details, the email arrives — with their message in full, how to reach
              them, and <strong>every turn of the chat, both sides</strong>. You can tell from your phone whether
              this is worth stopping for.
            </p>
            <p style={BODY}>
              Above the transcript is a short brief: what they want, their budget and timing <em>if they said them</em>,
              and the questions the chat never got to ask. Nothing in it is estimated or inferred — if they never
              mentioned a budget, it says nothing about a budget.
            </p>
            <p style={BODY}>
              The same thread sits in your Topezia inbox. Reply there and it reaches them by email; if they still
              have the chat open, your reply lands in it while they are reading. From that point the bot steps out
              of a conversation two people are having.
            </p>
            <p style={{ ...BODY, marginBottom: 0 }}>
              Every Monday you also get one email: what visitors asked that week, what your site could not answer,
              and who is still waiting on you. Quiet weeks send nothing.
            </p>
          </div>
          <div style={{ minWidth: 0 }}><LeadEmail /></div>
        </div>
      </Section>

      {/* ── Selling ──────────────────────────────────────────────────────── */}
      <Section tint>
        <Split
          flip
          figure={
            <ChatFrame>
              <Visitor>i need a coffee table under £400, something low</Visitor>
              <Bot>The Lowbank is our lowest at 32cm and sits under that comfortably. Both sizes are in stock — the buttons below go straight to checkout.</Bot>
              <ProductCard name="Lowbank Coffee Table — Solid Oak" price="From £285.00" options={["Small · £285", "Large · £340"]} />
            </ChatFrame>
          }
        >
          <span style={EYEBROW}>Revenue</span>
          <h2 style={H2}>It sells, and it sends them to your checkout</h2>
          <p style={BODY}>
            On a WooCommerce or Shopify site it shows the matching products as proper cards, with a button per
            variant that drops the item into the customer&apos;s basket and takes them straight to your checkout —
            already filled in. They pay you, in your shop, exactly as they do today.
            <strong> The money never touches Topezia.</strong>
          </p>
          <p style={BODY}>
            When someone is clearly ready to buy, it stops interviewing them. No portfolio link, no
            &ldquo;tell me about your business&rdquo; — it names the options, says the buttons go to checkout, and
            gets out of the way. Prices only ever come from the product&apos;s own price field.
          </p>
          <p style={{ ...BODY, marginBottom: 0 }}>
            Mark a conversation won in your inbox and type what it was worth, and the chat starts showing you what
            it has actually brought in. Those totals only ever count what you told them — never a guess.
          </p>
        </Split>
      </Section>

      {/* ── Order tracking ───────────────────────────────────────────────── */}
      <Section>
        <Split
          figure={
            <ChatFrame sub="Answers order questions">
              <Visitor>where&apos;s my order? #1042</Visitor>
              <Bot>I can look that up — what&apos;s the email address or postcode on the order?</Bot>
              <Visitor>dana@example.com</Visitor>
              <Bot>Order #1042 was placed on 25 July and shipped on the 28th with DPD. Tracking number 9400111899223 — the link is on your dispatch email.</Bot>
            </ChatFrame>
          }
        >
          <span style={EYEBROW}>After the sale</span>
          <h2 style={H2}>&ldquo;Where is my order?&rdquo; — answered, without you</h2>
          <p style={BODY}>
            Connect WooCommerce, Shopify or BigCommerce with a read-only key and the chat answers order questions
            from your own records: status, when it was placed, the carrier and tracking number. It reads orders and
            never changes them, and it never guesses a delivery date.
          </p>
          <p style={BODY}>
            It asks for the order number <strong>and</strong> the email or postcode on that order before it says
            anything. Order numbers are sequential and printed on every confirmation email — one on its own could be
            anyone&apos;s, and we are not willing to read out your customers&apos; orders to whoever types a number.
          </p>
          <p style={{ ...BODY, marginBottom: 0 }}>
            It is off until you connect a store and switch it on, and we test the connection before saving it, so a
            wrong key fails on your settings page rather than in front of a customer.
          </p>
        </Split>
      </Section>

      {/* ── Options ──────────────────────────────────────────────────────── */}
      <Section tint>
        <h2 style={H2}>What you control</h2>
        <p style={{ ...LEAD, maxWidth: 680 }}>
          All of it from one page, and all of it changeable at any time.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          <Feature title="Your colour">The bubble, the buttons and the replies in your brand colour, on paid plans.</Feature>
          <Feature title="Your logo, round">Your company mark in the chat header.</Feature>
          <Feature title="Your opening line">Write it yourself, or leave it and the chat names whatever page they are on.</Feature>
          <Feature title="Open by itself — or not">After a pause you set, a deep scroll, or a move to leave. Once per visit.</Feature>
          <Feature title="Chime, or silence">A soft two-note chime when it opens itself. Off in one click.</Feature>
          <Feature title="Ask for details — or not">The contact card after the first answer, on or off.</Feature>
          <Feature title="Your hours">Outside them it says plainly that nobody is there and when you are back, instead of letting someone sit waiting.</Feature>
          <Feature title="Teach it answers">Anything your site does not spell out. What you write wins over your pages, and re-scanning never erases it.</Feature>
          <Feature title="Weekly digest">One email on Mondays, or none.</Feature>
          <Feature title="Voice">Visitors can speak instead of type, and have replies read back, where their browser supports it.</Feature>
          <Feature title="Several websites">Studio runs up to ten, each with its own answers, colour and stats.</Feature>
          <Feature title="Turn it off">One switch. The chat disappears from your site; everything it collected stays yours.</Feature>
        </div>
      </Section>

      {/* ── Honest limits ────────────────────────────────────────────────── */}
      <Section>
        <h2 style={H2}>What it deliberately doesn&apos;t do</h2>
        <p style={{ ...LEAD, maxWidth: 720 }}>
          Worth knowing before you install it, rather than after.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          <Feature title="It won&apos;t invent a price">If the number is not on your site or in an answer you wrote, it says it does not know and passes you the person.</Feature>
          <Feature title="It won&apos;t promise a delivery date">Even when it can see the tracking. It reports what the courier says and stops there.</Feature>
          <Feature title="It won&apos;t take payment">Checkout happens in your shop, on your account. Topezia never handles the money.</Feature>
          <Feature title="It won&apos;t pretend someone is there">Outside your hours it says so. If it has no measured reply time, it claims none.</Feature>
          <Feature title="It won&apos;t look up an order from a name">Or a phone number. Those are not secrets, and neither is an order number on its own.</Feature>
          <Feature title="It won&apos;t fake a number">Leads, won deals and revenue only ever count what actually happened, or what you typed in yourself.</Feature>
        </div>
      </Section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <Section tint>
        <div id="pricing" style={{ scrollMarginTop: 80 }}>
          <h2 style={H2}>What it costs</h2>
          <p style={{ ...LEAD, maxWidth: 680 }}>
            Leads, your inbox and deal tracking are free forever, on every plan. What the plans buy is AI capacity —
            how many questions it answers and how much of your site it reads.
          </p>
          {/* Capped columns, not 1fr: when Stripe has no live prices this
              renders ONE card, and a single card stretched across 1040px
              looks like a bug rather than a plan. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,340px))", gap: 16, justifyContent: "center" }}>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column" }}>
              <b style={{ fontSize: 16 }}>Free</b>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", margin: "10px 0 2px" }}>$0</div>
              <div style={{ fontSize: 12.5, color: "#64748B", minHeight: 34 }}>forever, 1 website</div>
              <ul style={{ margin: "14px 0 18px", paddingLeft: 18, color: "#475569", fontSize: 13, lineHeight: 1.9, flex: 1 }}>
                <li>{n(free.aiRepliesPerMonth)} AI answers a month</li>
                <li>{n(free.pages)} pages scanned</li>
                <li>Unlimited leads and inbox</li>
                <li>Teach it {n(free.facts)} answers</li>
              </ul>
              <Cta href="/employer/widget" ghost>Start free</Cta>
            </div>

            {plans.map((p) => (
              <div key={p.id} style={{
                background: "#fff", border: `1px solid ${p.id === "PRO" ? "#C7D2FE" : "#E2E8F0"}`,
                borderRadius: 16, padding: 22, display: "flex", flexDirection: "column",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <b style={{ fontSize: 16 }}>{p.name}</b>
                  {p.id === "PRO" && (
                    <span style={{ background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, fontWeight: 700 }}>
                      Most popular
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", margin: "10px 0 2px" }}>
                  {p.monthly?.label ?? p.yearly?.label ?? "—"}
                </div>
                <div style={{ fontSize: 12.5, color: "#64748B", minHeight: 34 }}>
                  {p.yearly
                    ? `or $${(p.yearly.amount / 100).toLocaleString("en-US")} billed yearly`
                    : p.sites === 1 ? "per website" : `up to ${p.sites} websites`}
                </div>
                <ul style={{ margin: "14px 0 18px", paddingLeft: 18, color: "#475569", fontSize: 13, lineHeight: 1.9, flex: 1 }}>
                  <li>{p.sites === 1 ? "1 website" : `${p.sites} websites`}</li>
                  <li>{n(p.aiRepliesPerMonth)} AI answers a month{p.sites > 1 ? ", shared" : ""}</li>
                  <li>{n(p.pages)} pages scanned</li>
                  <li>Teach it {n(p.facts)} answers</li>
                  {p.aiAssist && <li>Drafted replies, weekly digest, intake briefs</li>}
                  {!p.branded && <li>No Topezia branding, your own colour</li>}
                </ul>
                {p.forSale
                  ? <Cta href="/employer/billing">Choose {p.name}</Cta>
                  : <p style={{ margin: 0, fontSize: 12.5, color: "#94A3B8", textAlign: "center" }}>Not on sale yet.</p>}
              </div>
            ))}
          </div>

          {badgeOff && (
            <p style={{
              marginTop: 20, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12,
              padding: "13px 16px", fontSize: 13.5, color: "#065F46", lineHeight: 1.65, maxWidth: 660,
            }}>
              <b>Keep a small &ldquo;AI chat powered by Topezia&rdquo; line on your chat and save {badgeOff.label} a
              month.</b> Your choice, and you can change your mind whenever you like.
            </p>
          )}
          <p style={{ marginTop: 16, fontSize: 13.5, color: "#64748B" }}>
            Run out of AI answers and the chat does not go dark — it keeps taking messages, so you never lose a
            lead to a limit. <Link href="/pricing/business" style={{ color: "#4F46E5", fontWeight: 700, textDecoration: "none" }}>Full plan comparison →</Link>
          </p>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section>
        <h2 style={H2}>Questions</h2>
        <div style={{ maxWidth: 760, marginTop: 18 }}>
          {FAQ.map((f) => (
            <div key={f.q} style={{ borderTop: "1px solid #E2E8F0", padding: "16px 0" }}>
              <b style={{ display: "block", fontSize: 15, color: "#0F172A", marginBottom: 6 }}>{f.q}</b>
              <span style={{ fontSize: 14.3, lineHeight: 1.75, color: "#475569" }}>{f.a}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "52px 20px", textAlign: "center" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.8px", color: "#fff", margin: "0 0 10px" }}>
            Put it on your site and see what people ask
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "#E0E7FF", margin: "0 auto 22px", maxWidth: 560 }}>
            Free for one website, no card, and you will know within a week whether it is earning its place — because
            it tells you exactly what it was asked and what it brought in.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <Cta href="/employer/widget" ghost>Start free</Cta>
            <Link href="/join" style={{
              display: "inline-block", textDecoration: "none", borderRadius: 11, padding: "12px 22px",
              fontSize: 14, fontWeight: 700, color: "#fff", border: "1px solid rgba(255,255,255,.5)",
            }}>Create an account</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
