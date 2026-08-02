/**
 * BigCommerce, through the v2 Orders API.
 *
 * The merchant creates a store-level API account with Orders: read-only and
 * pastes the store hash and access token. v2 rather than v3 because orders
 * only exist in v2 — v3 never covered them.
 *
 * Products and shipments are separate calls, so an order costs three round
 * trips. They run in parallel and both are optional: an order still answers
 * "where is it?" if the products call fails.
 */
import type { LookupResult, OrderShipment, OrderStage, OrderStatus, StoreCredentials } from "./types";
import { fetchJson, normalizeVerifier } from "./types";

type BcOrder = {
  id: number;
  status?: string;
  status_id?: number;
  date_created?: string;
  billing_address?: { email?: string; zip?: string };
  customer_id?: number;
};
type BcProduct = { name?: string; quantity?: number };
type BcShipment = {
  tracking_number?: string;
  shipping_method?: string;
  tracking_carrier?: string;
  shipping_provider?: string;
  tracking_link?: string;
  date_created?: string;
};

/** BigCommerce's status ids are stable; the names are editable per store, so
 *  the id decides the stage and the store's own name is what gets shown. */
const STAGES: Record<number, OrderStage> = {
  0: "processing", // Incomplete
  1: "processing", // Pending
  2: "shipped", // Shipped
  3: "shipped", // Partially Shipped
  4: "refunded", // Refunded
  5: "cancelled", // Cancelled
  6: "cancelled", // Declined
  7: "awaiting_payment", // Awaiting Payment
  8: "processing", // Awaiting Pickup
  9: "processing", // Awaiting Shipment
  10: "delivered", // Completed
  11: "processing", // Awaiting Fulfillment
  12: "on_hold", // Manual Verification Required
  13: "cancelled", // Disputed
  14: "refunded", // Partially Refunded
};

function api(cred: Extract<StoreCredentials, { platform: "bigcommerce" }>, path: string): string {
  return `https://api.bigcommerce.com/stores/${encodeURIComponent(cred.storeHash.trim())}${path}`;
}
const headers = (cred: Extract<StoreCredentials, { platform: "bigcommerce" }>) => ({
  "X-Auth-Token": cred.accessToken,
  Accept: "application/json",
});

export async function lookupBigCommerceOrder(
  cred: Extract<StoreCredentials, { platform: "bigcommerce" }>,
  reference: string,
  verifiers: string[]
): Promise<LookupResult> {
  const id = reference.replace(/^#/, "").trim();
  // BigCommerce order numbers ARE their ids — there is nothing to search by.
  if (!/^\d+$/.test(id)) return { ok: false, reason: "not_found" };

  let order: BcOrder;
  try {
    order = (await fetchJson(api(cred, `/v2/orders/${id}`), { headers: headers(cred) })) as BcOrder;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // v2 answers 404 for an unknown order — a real "no such order".
    if (message.includes("404")) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "unavailable" };
  }
  if (!order?.id) return { ok: false, reason: "not_found" };

  const known = [order.billing_address?.email, order.billing_address?.zip]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map(normalizeVerifier);
  if (!verifiers.some((v) => known.includes(v))) return { ok: false, reason: "not_found" };

  // Only now — after the verifier matched — is anything else about this
  // order fetched. Nothing extra leaves the store for a failed guess.
  const [products, shipments] = await Promise.all([
    fetchJson(api(cred, `/v2/orders/${order.id}/products`), { headers: headers(cred) }).catch(() => []),
    fetchJson(api(cred, `/v2/orders/${order.id}/shipments`), { headers: headers(cred) }).catch(() => []),
  ]);

  const items = (Array.isArray(products) ? (products as BcProduct[]) : []).slice(0, 12).map((p) => ({
    name: String(p.name ?? "Item"),
    quantity: Number(p.quantity ?? 1),
  }));
  const parcels: OrderShipment[] = (Array.isArray(shipments) ? (shipments as BcShipment[]) : [])
    .map((s) => ({
      carrier: s.tracking_carrier || s.shipping_provider || s.shipping_method || null,
      trackingNumber: s.tracking_number ?? null,
      trackingUrl: s.tracking_link || null,
      shippedAt: s.date_created ?? null,
    }))
    .filter((s) => s.trackingNumber || s.trackingUrl);

  return {
    ok: true,
    order: {
      reference: String(order.id),
      stage: STAGES[order.status_id ?? -1] ?? "unknown",
      stageLabel: order.status || "Unknown",
      placedAt: order.date_created ?? null,
      items,
      shipments: parcels,
    },
  };
}

export async function checkBigCommerceCredentials(
  cred: Extract<StoreCredentials, { platform: "bigcommerce" }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetchJson(api(cred, "/v2/orders?limit=1"), { headers: headers(cred) });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("401")) return { ok: false, error: "BigCommerce rejected that access token." };
    if (message.includes("403")) {
      return { ok: false, error: "That token cannot read orders. Give the API account the Orders: read-only scope." };
    }
    if (message.includes("404")) return { ok: false, error: "No store with that hash. Check the store hash." };
    return { ok: false, error: `Could not reach BigCommerce (${message}).` };
  }
}
