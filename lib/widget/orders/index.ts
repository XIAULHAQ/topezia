/**
 * "Where is my order?" — answered from the merchant's own store.
 *
 * THE RULE THAT SHAPES ALL OF THIS: an order number is not a secret. They are
 * short, sequential and printed on every email; #1042 is one keystroke from
 * #1043. So a number alone gets nothing. The visitor must also produce
 * something only the buyer would have — the email on the order, or its
 * postcode — and the two must agree.
 *
 * And a failed lookup NEVER says which half failed. "No such order" and
 * "wrong email" are the same answer, because telling them apart turns the
 * chat into an oracle for which order numbers exist, and from there into a
 * way to walk a shop's customer list. Both come back `not_found`, and the
 * assistant is told to say one thing.
 *
 * The model never calls the store. The lookup happens server-side before the
 * reply is generated and the result is handed to the prompt as fact — the
 * same rule as the product shelf: the model phrases what it is given and can
 * neither invent a status nor reach for an order it wasn't handed.
 */
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson, maskSecret } from "@/lib/crypto/secrets";
import { detectContactInChat } from "../contact";
import { normalizeVerifier } from "./types";
import { lookupWooOrder, checkWooCredentials } from "./woocommerce";
import { lookupShopifyOrder, checkShopifyCredentials } from "./shopify";
import { lookupBigCommerceOrder, checkBigCommerceCredentials } from "./bigcommerce";
import type { LookupResult, StoreCredentials, StorePlatform } from "./types";

export * from "./types";

/* ── credentials ─────────────────────────────────────────────────────────── */

export async function loadCredentials(siteId: string): Promise<StoreCredentials | null> {
  const row = await prisma.siteStoreCredential.findUnique({ where: { siteId }, select: { secret: true } });
  if (!row) return null;
  // Undecryptable is treated as absent, never as empty: a rotated key must
  // disable the feature, not send blank credentials at someone's store.
  return decryptJson<StoreCredentials>(row.secret);
}

export async function saveCredentials(siteId: string, cred: StoreCredentials): Promise<void> {
  const hint = maskSecret(
    cred.platform === "woocommerce" ? cred.consumerKey : cred.accessToken
  );
  const secret = encryptJson(cred);
  await prisma.siteStoreCredential.upsert({
    where: { siteId },
    create: { siteId, platform: cred.platform, secret, hint },
    update: { platform: cred.platform, secret, hint, lastError: null, lastCheckedAt: null },
  });
}

/** Prove the connection works, and record the verdict where the owner sees
 *  it — a key revoked next month should say so on the settings page rather
 *  than fail quietly at a customer. */
export async function checkCredentials(
  cred: StoreCredentials
): Promise<{ ok: true; note?: string } | { ok: false; error: string }> {
  switch (cred.platform) {
    case "woocommerce": return checkWooCredentials(cred);
    case "shopify": return checkShopifyCredentials(cred);
    case "bigcommerce": return checkBigCommerceCredentials(cred);
  }
}

export async function recordCheck(siteId: string, error: string | null): Promise<void> {
  await prisma.siteStoreCredential
    .update({ where: { siteId }, data: { lastCheckedAt: new Date(), lastError: error } })
    .catch(() => { /* the check's verdict is not worth failing the request over */ });
}

/* ── reading the question ────────────────────────────────────────────────── */

/** Order-chasing, in the languages the widget speaks. Deliberately loose: a
 *  false positive only means we look for a reference and find none. */
const INTENT_RE =
  /\b(order|orders|ordered|tracking|track|parcel|package|shipment|shipped|delivery|delivered|dispatch|pedido|rastreo|env[ií]o|commande|suivi|colis|livraison|bestellung|sendung|lieferung|verfolgen|ordine|spedizione|tracciamento|bestelling|zending|levering|encomenda|rastreamento)\b/i;

/** A reference the customer would read off their confirmation: "#1042",
 *  "order 1042", "order no. EN-1042". A BARE number is never taken on its own
 *  — "3" in "I ordered 3 banners" is not an order number. */
const REFERENCE_RES = [
  /#\s*([A-Z0-9][A-Z0-9-]{2,19})\b/i,
  /\border\s*(?:number|no\.?|#|id|ref(?:erence)?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,19})\b/i,
  /\b(?:pedido|commande|bestellung|ordine|bestelling|encomenda)\s*(?:n[o°º]?\.?|number|nr\.?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,19})\b/i,
];

/** Words that follow "order" without being one. */
const NOT_A_REFERENCE = new Set([
  "status", "number", "id", "was", "is", "for", "from", "and", "the", "my", "your", "it",
  "no", "not", "yet", "has", "have", "had", "will", "would", "can", "could", "please",
  "online", "form", "page", "confirmation", "history", "details", "update", "updates",
]);

export type OrderQuery = {
  /** What they called their order, or null. */
  reference: string | null;
  /** Everything they said that MIGHT be the email or postcode on the order.
   *  Extra candidates cost nothing — each is only ever compared against the
   *  order's own values, so a wrong guess reveals nothing. */
  verifiers: string[];
  /** They are asking about an order, whether or not they gave a reference. */
  intent: boolean;
};

export function parseOrderQuery(
  turns: { role: string; text: string }[],
  siteDomain?: string | null
): OrderQuery {
  const visitor = turns.filter((t) => t.role === "visitor");
  const said = visitor.map((t) => t.text);
  const intent = said.some((t) => INTENT_RE.test(t));

  // Latest reference wins — a correction comes after the mistake.
  let reference: string | null = null;
  for (const text of said) {
    for (const re of REFERENCE_RES) {
      const hit = text.match(re)?.[1];
      if (hit && !NOT_A_REFERENCE.has(hit.toLowerCase())) reference = hit;
    }
  }

  // Candidate verifiers: the email they gave, plus every short token with a
  // digit in it (postcodes worldwide: "90210", "SW1A 1AA", "K1A 0B1"), plus
  // adjacent pairs so a postcode written with a space survives.
  const verifiers = new Set<string>();
  const email = detectContactInChat(visitor as { role: "visitor"; text: string }[], siteDomain).email;
  if (email) verifiers.add(email);
  for (const text of said.slice(-8)) {
    for (const m of text.match(/[^\s,;:!?()[\]"']+/g) ?? []) {
      const emails = m.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/i);
      if (emails) verifiers.add(emails[0].toLowerCase());
    }
    const tokens = (text.match(/[A-Za-z0-9-]+/g) ?? []).filter((t) => /\d/.test(t) && t.length >= 3 && t.length <= 10);
    for (let i = 0; i < tokens.length; i++) {
      verifiers.add(tokens[i].toLowerCase());
      // "SW1A 1AA" arrives as two tokens; the second half has the digit.
      const pair = `${tokens[i]}${tokens[i + 1] ?? ""}`.toLowerCase();
      if (pair.length >= 4 && pair.length <= 12) verifiers.add(pair);
    }
    const words = text.match(/[A-Za-z0-9]+/g) ?? [];
    for (let i = 0; i < words.length - 1; i++) {
      const joined = `${words[i]}${words[i + 1]}`.toLowerCase();
      if (joined.length >= 5 && joined.length <= 10 && /\d/.test(joined)) verifiers.add(joined);
    }
  }

  // THE REFERENCE IS NOT A VERIFIER. It is scooped up by the token sweep
  // above, and left in it would mean "where is order #1042" counts as having
  // supplied proof — so the lookup runs, fails, and the visitor is told their
  // order can't be matched when in truth they were never asked for anything.
  if (reference) {
    const ref = normalizeVerifier(reference);
    for (const v of Array.from(verifiers)) {
      if (v === ref || v.replace(/[^a-z0-9]/g, "") === ref.replace(/[^a-z0-9]/g, "")) verifiers.delete(v);
    }
  }

  return { reference, verifiers: Array.from(verifiers).slice(0, 40), intent };
}

/* ── the lookup ──────────────────────────────────────────────────────────── */

export async function lookupOrder(
  cred: StoreCredentials,
  reference: string,
  verifiers: string[]
): Promise<LookupResult> {
  if (!reference.trim() || verifiers.length === 0) return { ok: false, reason: "not_found" };
  try {
    switch (cred.platform) {
      case "woocommerce": return await lookupWooOrder(cred, reference, verifiers);
      case "shopify": return await lookupShopifyOrder(cred, reference, verifiers);
      case "bigcommerce": return await lookupBigCommerceOrder(cred, reference, verifiers);
    }
  } catch (err) {
    console.error("[widget/orders] lookup failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable" };
  }
}

/** Validate what an owner typed into the connect form, per platform. */
export function readCredentials(platform: StorePlatform, body: Record<string, unknown>): StoreCredentials | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  if (platform === "woocommerce") {
    let storeUrl = str("storeUrl");
    if (storeUrl && !/^https?:\/\//i.test(storeUrl)) storeUrl = `https://${storeUrl}`;
    // http would put a merchant's API key on the wire in clear text.
    if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(storeUrl)) return null;
    const consumerKey = str("consumerKey");
    const consumerSecret = str("consumerSecret");
    if (!consumerKey || !consumerSecret) return null;
    return { platform, storeUrl: storeUrl.replace(/\/+$/, ""), consumerKey, consumerSecret };
  }
  if (platform === "shopify") {
    const shopDomain = str("shopDomain").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    const accessToken = str("accessToken");
    if (!shopDomain || !accessToken) return null;
    return { platform, shopDomain, accessToken };
  }
  const storeHash = str("storeHash");
  const accessToken = str("accessToken");
  if (!storeHash || !accessToken) return null;
  return { platform, storeHash, accessToken };
}
