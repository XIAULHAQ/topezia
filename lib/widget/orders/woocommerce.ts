/**
 * WooCommerce, through its own REST API (wc/v3).
 *
 * The merchant creates a READ-ONLY key in WooCommerce → Settings → Advanced →
 * REST API. Read-only is not a suggestion: nothing here writes, and a key
 * with write access would let a bug or a bad actor change someone's orders.
 *
 * Woo core has no concept of tracking. The near-universal Shipment Tracking
 * plugin writes it into order meta, so that is read when it is there and
 * simply absent when it isn't — an order with no tracking says so rather than
 * inventing a carrier.
 */
import type { LookupResult, OrderShipment, OrderStage, OrderStatus, StoreCredentials } from "./types";
import { fetchJson, normalizeVerifier } from "./types";

type WooOrder = {
  id: number;
  number?: string;
  status?: string;
  date_created?: string;
  date_created_gmt?: string;
  billing?: { email?: string; postcode?: string };
  shipping?: { postcode?: string };
  line_items?: { name?: string; quantity?: number }[];
  meta_data?: { key?: string; value?: unknown }[];
};

/**
 * Woo's statuses, in Woo's words.
 *
 * `completed` is the awkward one: most shops mark it when the parcel goes out,
 * some when a digital download is ready. It maps to "shipped" and the store's
 * own label rides along, so the reply says what the merchant says rather than
 * promising a doorstep.
 */
const STAGES: Record<string, OrderStage> = {
  pending: "awaiting_payment",
  "on-hold": "on_hold",
  processing: "processing",
  completed: "shipped",
  cancelled: "cancelled",
  refunded: "refunded",
  failed: "cancelled",
  "checkout-draft": "awaiting_payment",
};

const LABELS: Record<string, string> = {
  pending: "Pending payment",
  "on-hold": "On hold",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
};

function auth(cred: Extract<StoreCredentials, { platform: "woocommerce" }>): string {
  return `Basic ${Buffer.from(`${cred.consumerKey}:${cred.consumerSecret}`).toString("base64")}`;
}

/** The Shipment Tracking plugin's meta, when the shop uses it. */
function shipmentsFrom(order: WooOrder): OrderShipment[] {
  const meta = order.meta_data?.find((m) => m.key === "_wc_shipment_tracking_items");
  if (!Array.isArray(meta?.value)) return [];
  return (meta.value as Record<string, unknown>[])
    .map((t) => ({
      carrier: typeof t.tracking_provider === "string" && t.tracking_provider
        ? t.tracking_provider
        : typeof t.custom_tracking_provider === "string" && t.custom_tracking_provider
          ? t.custom_tracking_provider
          : null,
      trackingNumber: typeof t.tracking_number === "string" ? t.tracking_number : null,
      // Only a link the SHOP recorded. Building one from a carrier name is
      // how you send someone to a page about a parcel that isn't theirs.
      trackingUrl: typeof t.custom_tracking_link === "string" && t.custom_tracking_link ? t.custom_tracking_link : null,
      shippedAt: typeof t.date_shipped === "string" ? t.date_shipped : null,
    }))
    .filter((s) => s.trackingNumber || s.trackingUrl);
}

function toStatus(order: WooOrder): OrderStatus {
  const status = (order.status ?? "").toLowerCase();
  return {
    reference: order.number ? String(order.number) : String(order.id),
    stage: STAGES[status] ?? "unknown",
    stageLabel: LABELS[status] ?? (status ? status.replace(/-/g, " ") : "Unknown"),
    placedAt: order.date_created_gmt ? `${order.date_created_gmt}Z` : order.date_created ?? null,
    items: (order.line_items ?? []).slice(0, 12).map((l) => ({
      name: String(l.name ?? "Item"),
      quantity: Number(l.quantity ?? 1),
    })),
    shipments: shipmentsFrom(order),
  };
}

export async function lookupWooOrder(
  cred: Extract<StoreCredentials, { platform: "woocommerce" }>,
  reference: string,
  verifiers: string[]
): Promise<LookupResult> {
  const base = cred.storeUrl.replace(/\/+$/, "");
  const headers = { Authorization: auth(cred), Accept: "application/json" };

  let candidates: WooOrder[] = [];
  try {
    // `search` covers shops whose order numbers are not their ids (sequential
    // -order plugins are everywhere). The direct fetch covers the plain case
    // and is the only one that works when search is disabled.
    const search = (await fetchJson(
      `${base}/wp-json/wc/v3/orders?search=${encodeURIComponent(reference)}&per_page=5`,
      { headers }
    )) as WooOrder[];
    if (Array.isArray(search)) candidates = search;

    if (!candidates.length && /^\d+$/.test(reference)) {
      const direct = (await fetchJson(`${base}/wp-json/wc/v3/orders/${reference}`, { headers })) as WooOrder;
      if (direct?.id) candidates = [direct];
    }
  } catch (err) {
    // A 404 from the direct fetch is a normal "no such order"; anything else
    // is the shop being unreachable, which the visitor must not read as
    // "your order doesn't exist".
    const message = err instanceof Error ? err.message : "";
    if (!message.includes("404")) return { ok: false, reason: "unavailable" };
  }

  const wanted = normalizeVerifier(reference);
  const match = candidates.find((o) => normalizeVerifier(String(o.number ?? o.id)) === wanted || String(o.id) === reference);
  if (!match) return { ok: false, reason: "not_found" };

  // The gate. An order number alone proves nothing — they are sequential and
  // guessable — so the visitor must also produce something only the buyer
  // would have.
  const known = [match.billing?.email, match.billing?.postcode, match.shipping?.postcode]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map(normalizeVerifier);
  if (!verifiers.some((v) => known.includes(v))) return { ok: false, reason: "not_found" };

  return { ok: true, order: toStatus(match) };
}

/** Proves the credentials work before a customer ever depends on them. */
export async function checkWooCredentials(
  cred: Extract<StoreCredentials, { platform: "woocommerce" }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = cred.storeUrl.replace(/\/+$/, "");
  try {
    await fetchJson(`${base}/wp-json/wc/v3/orders?per_page=1`, {
      headers: { Authorization: auth(cred), Accept: "application/json" },
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("401") || message.includes("403")) {
      return { ok: false, error: "WooCommerce refused those keys. Check the consumer key and secret, and that the key has Read permission." };
    }
    if (message.includes("404")) {
      return { ok: false, error: "No WooCommerce REST API at that address. Check the store URL." };
    }
    return { ok: false, error: `Could not reach the store (${message}).` };
  }
}
