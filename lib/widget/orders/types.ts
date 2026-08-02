/**
 * One shape for an order, whatever shop it came out of.
 *
 * WooCommerce, Shopify and BigCommerce disagree about nearly everything —
 * what a status is called, where tracking lives, whether an order number is
 * the id. The rest of the system should never learn any of that, so each
 * adapter translates into exactly this and nothing above it branches on
 * platform again.
 *
 * WHAT IS DELIBERATELY NOT HERE: the shipping address, the billing address,
 * the customer's phone, the payment method, the full line-item prices. A
 * visitor asking "where is my order?" needs status, dates and tracking. Every
 * extra field is one more thing that leaks the day someone guesses a
 * verifier, so the adapters never carry them out of the store in the first
 * place.
 */

export type OrderStage =
  /** Paid or awaiting payment, nothing shipped. */
  | "processing"
  /** Money not taken yet — bank transfer, cheque, cash on delivery. */
  | "awaiting_payment"
  | "on_hold"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "unknown";

export type OrderShipment = {
  carrier: string | null;
  trackingNumber: string | null;
  /** Only ever a URL the STORE gave us, never one we assembled from a
   *  carrier name — a wrong tracking link is worse than none. */
  trackingUrl: string | null;
  shippedAt: string | null;
};

export type OrderStatus = {
  /** What the customer calls it — the number on their confirmation email,
   *  which is often not the store's internal id. */
  reference: string;
  stage: OrderStage;
  /** The store's own wording, shown as-is when it says more than the stage
   *  does ("Partially shipped", "Awaiting stock"). */
  stageLabel: string;
  placedAt: string | null;
  /** Item names and quantities only. No prices: a status question is not a
   *  request for someone's receipt. */
  items: { name: string; quantity: number }[];
  shipments: OrderShipment[];
};

/**
 * The result of a lookup.
 *
 * `not_found` covers BOTH "no such order" and "the verifier didn't match",
 * on purpose and permanently. Telling those apart hands an attacker an oracle
 * for which order numbers exist, which is exactly how you enumerate a store's
 * customers. See lib/widget/orders/index.ts.
 */
export type LookupResult =
  | { ok: true; order: OrderStatus }
  | { ok: false; reason: "not_found" | "not_connected" | "unavailable" };

export type StorePlatform = "woocommerce" | "shopify" | "bigcommerce";

export function isStorePlatform(v: unknown): v is StorePlatform {
  return v === "woocommerce" || v === "shopify" || v === "bigcommerce";
}

/** What each platform needs from the merchant. Encrypted as one blob. */
export type StoreCredentials =
  | { platform: "woocommerce"; storeUrl: string; consumerKey: string; consumerSecret: string }
  | { platform: "shopify"; shopDomain: string; accessToken: string }
  | { platform: "bigcommerce"; storeHash: string; accessToken: string };

/** Comparing what the visitor typed with what the store holds.
 *
 *  Postcodes are written every which way ("SW1A 1AA", "sw1a1aa") and an email
 *  is case-insensitive in practice, so both sides are flattened before they
 *  are compared. Anything left is a genuine mismatch. */
export const normalizeVerifier = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

/** Timeouts everywhere: a merchant's shop being slow must never hold a
 *  visitor's chat open, and a hung fetch in a serverless function is a bill. */
export const STORE_TIMEOUT_MS = 6_000;

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const { timeoutMs = STORE_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`store responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
