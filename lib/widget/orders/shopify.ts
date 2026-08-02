/**
 * Shopify, through the Admin API.
 *
 * The merchant creates a custom app in their admin and grants `read_orders`.
 * WORTH KNOWING AND TELLING THEM: `read_orders` only reaches the last 60 days.
 * Older orders need `read_all_orders`, which Shopify grants on request. A
 * shop without it will simply not find a six-month-old order, and that looks
 * exactly like a wrong order number — so `checkShopifyCredentials` names the
 * limitation rather than leaving them to discover it through a confused
 * customer.
 *
 * The API version is pinned and overridable. Shopify supports each version
 * for a year and rejects unknown ones outright, so this is the kind of
 * constant that must be movable without a code change.
 */
import type { LookupResult, OrderShipment, OrderStage, OrderStatus, StoreCredentials } from "./types";
import { fetchJson, normalizeVerifier } from "./types";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";

type ShopifyOrder = {
  id: number;
  name?: string;
  order_number?: number;
  created_at?: string;
  cancelled_at?: string | null;
  financial_status?: string;
  fulfillment_status?: string | null;
  email?: string;
  contact_email?: string;
  shipping_address?: { zip?: string };
  billing_address?: { zip?: string };
  line_items?: { title?: string; quantity?: number }[];
  fulfillments?: {
    tracking_company?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
    tracking_urls?: string[];
    created_at?: string;
    shipment_status?: string | null;
  }[];
};

function host(cred: Extract<StoreCredentials, { platform: "shopify" }>): string {
  // Accept "shop", "shop.myshopify.com" or a pasted URL — merchants paste all
  // three, and refusing two of them is a support ticket, not a safeguard.
  const bare = cred.shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return bare.includes(".") ? bare : `${bare}.myshopify.com`;
}

function stageOf(order: ShopifyOrder): { stage: OrderStage; label: string } {
  if (order.cancelled_at) return { stage: "cancelled", label: "Cancelled" };
  if (order.financial_status === "refunded") return { stage: "refunded", label: "Refunded" };
  // Shopify's own shipment_status is the only thing that knows about delivery.
  const delivered = order.fulfillments?.some((f) => f.shipment_status === "delivered");
  if (delivered) return { stage: "delivered", label: "Delivered" };
  if (order.fulfillment_status === "fulfilled") return { stage: "shipped", label: "Shipped" };
  if (order.fulfillment_status === "partial") return { stage: "shipped", label: "Partially shipped" };
  if (order.financial_status === "pending" || order.financial_status === "authorized") {
    return { stage: "awaiting_payment", label: "Awaiting payment" };
  }
  if (order.financial_status === "on_hold") return { stage: "on_hold", label: "On hold" };
  return { stage: "processing", label: "Being prepared" };
}

function toStatus(order: ShopifyOrder): OrderStatus {
  const { stage, label } = stageOf(order);
  const shipments: OrderShipment[] = (order.fulfillments ?? [])
    .map((f) => ({
      carrier: f.tracking_company ?? null,
      trackingNumber: f.tracking_number ?? null,
      trackingUrl: f.tracking_url ?? f.tracking_urls?.[0] ?? null,
      shippedAt: f.created_at ?? null,
    }))
    .filter((s) => s.trackingNumber || s.trackingUrl);

  return {
    reference: order.name ?? (order.order_number != null ? `#${order.order_number}` : String(order.id)),
    stage,
    stageLabel: label,
    placedAt: order.created_at ?? null,
    items: (order.line_items ?? []).slice(0, 12).map((l) => ({
      name: String(l.title ?? "Item"),
      quantity: Number(l.quantity ?? 1),
    })),
    shipments,
  };
}

export async function lookupShopifyOrder(
  cred: Extract<StoreCredentials, { platform: "shopify" }>,
  reference: string,
  verifiers: string[]
): Promise<LookupResult> {
  const headers = { "X-Shopify-Access-Token": cred.accessToken, Accept: "application/json" };
  const base = `https://${host(cred)}/admin/api/${API_VERSION}`;
  // Customers say "1001", "#1001" and "EN1001" for the same order; `name`
  // matches what is printed on their confirmation, with or without the hash.
  const name = reference.trim();
  const names = Array.from(new Set([name, name.replace(/^#/, ""), `#${name.replace(/^#/, "")}`]));

  let orders: ShopifyOrder[] = [];
  try {
    for (const candidate of names) {
      const data = (await fetchJson(
        `${base}/orders.json?status=any&name=${encodeURIComponent(candidate)}&limit=5`,
        { headers }
      )) as { orders?: ShopifyOrder[] };
      if (data?.orders?.length) { orders = data.orders; break; }
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!orders.length) return { ok: false, reason: "not_found" };

  const wanted = normalizeVerifier(name.replace(/^#/, ""));
  const match =
    orders.find((o) => normalizeVerifier((o.name ?? "").replace(/^#/, "")) === wanted) ?? orders[0];

  const known = [match.email, match.contact_email, match.shipping_address?.zip, match.billing_address?.zip]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map(normalizeVerifier);
  if (!verifiers.some((v) => known.includes(v))) return { ok: false, reason: "not_found" };

  return { ok: true, order: toStatus(match) };
}

export async function checkShopifyCredentials(
  cred: Extract<StoreCredentials, { platform: "shopify" }>
): Promise<{ ok: true; note?: string } | { ok: false; error: string }> {
  try {
    await fetchJson(`https://${host(cred)}/admin/api/${API_VERSION}/orders.json?status=any&limit=1`, {
      headers: { "X-Shopify-Access-Token": cred.accessToken, Accept: "application/json" },
    });
    return {
      ok: true,
      note: "Connected. Shopify's read_orders scope only reaches the last 60 days — ask Shopify for read_all_orders if your customers chase older orders.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("401")) return { ok: false, error: "Shopify rejected that access token." };
    if (message.includes("403")) {
      return { ok: false, error: "That token is missing the read_orders scope. Add it to the custom app and reinstall." };
    }
    if (message.includes("404")) return { ok: false, error: "No Shopify store at that address. Check the shop domain." };
    return { ok: false, error: `Could not reach Shopify (${message}).` };
  }
}
