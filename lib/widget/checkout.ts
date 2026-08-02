/**
 * Handing a visitor to the store's own checkout, basket already filled.
 *
 * THE MONEY IS NEVER OURS. We build a link to the merchant's checkout with
 * the chosen item pre-added; they pay the merchant there, under the
 * merchant's own tax, shipping, stock and refund rules. No card data comes
 * near Topezia, and none of this needs Stripe Connect.
 *
 * Everything here is built SERVER-SIDE from crawled data. The model may
 * point at a product; it never composes a URL, a price or a quantity — the
 * same rule that keeps the product cards honest, and it matters more once
 * the link ends at a payment form.
 */
export type Variation = {
  /** The store's variation id. */
  id: string;
  /** What the visitor picks: "Basic", "Large / Red". */
  label: string;
  /** Display string, straight from the store. Never arithmetic. */
  price: string;
  /** WooCommerce attribute query params, e.g. attribute_pa_size: "large". */
  attributes: Record<string, string>;
};

export type BuyOption = { label: string; price: string; url: string };

/** Anything unexpected in the JSON column reads as "no variations". */
export function parseVariations(value: unknown): Variation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const r = v as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return [];
    const attributes: Record<string, string> = {};
    if (r.attributes && typeof r.attributes === "object" && !Array.isArray(r.attributes)) {
      for (const [k, val] of Object.entries(r.attributes as Record<string, unknown>)) {
        if (typeof val === "string" && val) attributes[k] = val;
      }
    }
    return [{
      id: r.id,
      label: typeof r.label === "string" && r.label ? r.label : "Buy",
      price: typeof r.price === "string" ? r.price : "",
      attributes,
    }];
  });
}

/**
 * The buy options for one product — one per variation, or a single button
 * for a simple product. Empty when the product isn't purchasable, which is
 * how a sold-out item silently loses its button instead of sending someone
 * to a checkout that will refuse them.
 */
export function buyOptions(
  site: { domain: string; checkoutPath: string | null },
  product: { externalId: string | null; buyable: boolean; price: string | null; variations: unknown }
): BuyOption[] {
  if (!product.buyable || !product.externalId) return [];

  // The host is OURS to decide, never the model's or the crawl's: it is
  // always the site we are the assistant for.
  const base = `https://${site.domain.replace(/^www\./, "")}`;
  const path = normalizePath(site.checkoutPath);

  const build = (params: Record<string, string>) => {
    const q = new URLSearchParams({ "add-to-cart": product.externalId!, quantity: "1", ...params });
    return `${base}${path}?${q.toString()}`;
  };

  const variations = parseVariations(product.variations);
  if (variations.length > 0) {
    return variations.slice(0, 6).map((v) => ({
      label: v.label,
      price: v.price,
      url: build({ variation_id: v.id, ...v.attributes }),
    }));
  }

  return [{ label: "Buy now", price: product.price ?? "", url: build({}) }];
}

/** Keep it a path on the merchant's own site, whatever the crawl found. */
function normalizePath(raw: string | null): string {
  if (!raw) return "/checkout/";
  try {
    // Accept a full URL or a bare path; take only the pathname either way.
    const p = raw.startsWith("http") ? new URL(raw).pathname : raw;
    if (!p.startsWith("/")) return "/checkout/";
    return p.endsWith("/") ? p : `${p}/`;
  } catch {
    return "/checkout/";
  }
}
