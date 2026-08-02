/**
 * Content shared by the server page and the client landing component.
 *
 * It lives in its own module with no "use client" because the FAQ is needed
 * in TWO places: rendered as an accordion in the browser, and serialised into
 * FAQPage JSON-LD on the server. Exporting it from the client component makes
 * it a client reference rather than data, and the server then cannot map over
 * it at all.
 */

export type PlanCard = {
  name: string;
  price: string;
  per: string;
  note: string;
  flag: string | null;
  feats: string[];
  href: string;
  cta: string;
  /** The dark card. The design gives exactly one plan this treatment. */
  dark: boolean;
};

export const FAQS: [string, string][] = [
  [
    "Is the AI chatbot for my website really free?",
    "Yes. The free plan covers one website with 200 AI answers a month, 60 pages scanned and unlimited leads and inbox access. No card, free forever — and if you run out of AI answers the chat keeps taking messages rather than going dark.",
  ],
  [
    "Do I have to write the answers myself?",
    "No. It reads your website and answers from what is already there. You can override any answer by hand, and what you write wins over the page — including after a re-scan.",
  ],
  [
    "Can I use it as an AI chatbot for an ecommerce website?",
    "Yes. On Shopify and WooCommerce it shows your products as cards with buy buttons that drop the item into your own checkout. The money never touches Topezia — the customer pays you, in your shop, exactly as they do today.",
  ],
  [
    "How do I install the AI chat widget?",
    "One line of script in your site's HTML, or the Topezia Chat plugin if you run WordPress. Nothing else on your site changes, and the chat runs in its own frame so it cannot interfere with your pages.",
  ],
  [
    "Will the chatbot make things up?",
    "It answers only from your own pages and the answers you have written. When your site does not cover something — a price, a lead time, a policy — it says so and offers the message form rather than guessing.",
  ],
  [
    "Can it tell customers where their order is?",
    "Yes, on WooCommerce, Shopify and BigCommerce. It asks for the order number AND the email or postcode on that order before it says anything, because an order number on its own could be anyone's.",
  ],
];
