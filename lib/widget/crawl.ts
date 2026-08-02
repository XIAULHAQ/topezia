/**
 * Crawling the customer's OWN site so the widget can answer from it.
 *
 * Shape: sitemap first (most real sites have one), else a shallow BFS from
 * the homepage. Hard caps everywhere — this runs inside one serverless
 * invocation, and a crawl that outgrows that belongs to a later phase with a
 * queue, not a bigger timeout.
 *
 * The fetched HTML is THIRD-PARTY INPUT twice over: it gets sanitized to text
 * here (never rendered), and the answering prompt treats it as quotable
 * material, never as instructions — see lib/widget/answer.ts.
 *
 * SSRF: the owner types the domain, and we fetch it. Host-literal IPs,
 * localhost and obvious internal names are refused; everything else resolves
 * on Vercel's egress, which has nothing internal to reach. Guard is
 * belt-and-braces, not the security boundary.
 */
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";
import { decodeHtmlEntities } from "@/lib/sanitize";
import { embedBatch } from "@/lib/ingestion/embed";
import { FREE_LIMITS } from "./caps";
import { loadRobots, pathOf, type Robots } from "./robots";
import { signedHeaders } from "@/lib/bot-auth/sign";

const PAGE_TIMEOUT_MS = 10_000;
/** Long enough that a rate limiter has forgotten us, short enough that a
 *  whole crawl of retries still fits in one serverless invocation. */
const RETRY_PAUSE_MS = 1_500;
const PAGE_MAX_BYTES = 1_500_000;
const FETCH_CONCURRENCY = 5;
const CHUNK_TARGET = 1600; // chars per chunk, split on paragraph boundaries
const CHUNK_MIN = 150; // fragments below this are nav crumbs, not content
const MAX_CHUNKS = 300;
const EMBED_BATCH_SIZE = 64;

/** "https://www.foo.com/x" | "foo.com" → "www.foo.com" / "foo.com". */
export function normalizeDomain(raw: unknown): { ok: true; host: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return { ok: false, error: "Enter your website's domain." };
  let host: string;
  try {
    host = new URL(s.includes("://") ? s : `https://${s}`).hostname;
  } catch {
    return { ok: false, error: "That doesn't look like a domain." };
  }
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":")
  ) {
    return { ok: false, error: "Use your site's public domain name." };
  }
  if (host.endsWith("topezia.com")) {
    return { ok: false, error: "The widget is for your own website." };
  }
  return { ok: true, host };
}

/**
 * Why a fetch didn't produce a page. Counted rather than logged one by one:
 * a crawl that reads 1 of 200 pages used to report success, and the owner
 * was told "1 page scanned" as though their site only had one. What the
 * dashboard needs is not a stack trace, it's "your site refused us 199
 * times" — see crawlSite's summary.
 */
type FetchStats = { tried: number; ok: number; blocked: number; missing: number; timeout: number; other: number };

/**
 * Is this an interstitial rather than the page we asked for?
 *
 * Matched on the fingerprints the big protection services put in their own
 * challenge markup, and only in the first few KB where that markup lives —
 * a blog post ABOUT Cloudflare must not read as a Cloudflare challenge.
 * Being wrong in that direction drops a real page; being wrong the other way
 * teaches the chat nonsense. Small and short is the point.
 */
function looksLikeChallenge(html: string): boolean {
  const head = html.slice(0, 4000).toLowerCase();
  return (
    head.includes("cf-browser-verification") ||
    head.includes("cf_chl_opt") ||
    head.includes("challenge-platform") ||
    head.includes("<title>just a moment") ||
    head.includes("attention required! | cloudflare") ||
    head.includes("checking your browser before accessing") ||
    head.includes("<title>access denied") ||
    head.includes("ddos-guard") ||
    (head.includes("captcha-delivery.com") && head.includes("<script"))
  );
}

export const newFetchStats = (): FetchStats => ({ tried: 0, ok: 0, blocked: 0, missing: 0, timeout: 0, other: 0 });

async function fetchPage(url: string, stats?: FetchStats, retry = true): Promise<string | null> {
  // The timer must cover the BODY read, not just the headers, and an
  // early-returned response must have its body cancelled: an abandoned
  // undici stream that later errors (remote reset, timeout) throws an
  // UNCAUGHT "terminated" TypeError with no promise to reject into — it
  // crashed the first live crawl, not a request that was awaited.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  if (stats) stats.tried++;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "TopeziaWidget/1.0 (+https://www.topezia.com)", ...signedHeaders(url) },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || (!type.includes("html") && !type.includes("xml") && !type.includes("text"))) {
      await res.body?.cancel().catch(() => {});
      // 403/429/503 from a firewall is the one failure worth trying again:
      // it usually means "too fast", not "never". One retry, after a pause
      // long enough to matter, and only one — a crawler that hammers a site
      // that just asked it to stop deserves the block it gets.
      if (retry && (res.status === 429 || res.status === 503)) {
        clearTimeout(timer);
        await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
        if (stats) stats.tried--; // the retry counts it
        return fetchPage(url, stats, false);
      }
      if (stats) {
        if (res.status === 403 || res.status === 401 || res.status === 429 || res.status === 503) stats.blocked++;
        else if (res.status === 404 || res.status === 410) stats.missing++;
        else stats.other++;
      }
      return null;
    }
    const text = await res.text();
    // A bot challenge answers 200 with real HTML, so status alone can't see
    // it. Left undetected it is the WORST failure mode this crawler has: the
    // chat quietly learns "Just a moment… enable JavaScript" as though it
    // were the customer's homepage, and every answer is drawn from that.
    if (looksLikeChallenge(text)) {
      if (stats) stats.blocked++;
      return null;
    }
    if (stats) stats.ok++;
    return text.length > PAGE_MAX_BYTES ? text.slice(0, PAGE_MAX_BYTES) : text;
  } catch (err) {
    if (stats) {
      const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      if (aborted) stats.timeout++;
      else stats.other++;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What to tell the owner when most of their site wouldn't open. Null when
 * the crawl went well enough to be worth nothing being said.
 *
 * The threshold is deliberately generous — a few 404s in a stale sitemap are
 * normal and not worth alarming anyone over. Losing most of the site is not.
 */
export function crawlWarning(s: FetchStats): string | null {
  const failed = s.tried - s.ok;
  if (s.tried < 5 || failed <= s.tried / 2) return null;
  if (s.blocked > failed / 2) {
    return `Your site refused ${s.blocked} of ${s.tried} requests, so most pages couldn't be read. A firewall or security plugin is probably blocking our reader — allow the user agent "TopeziaWidget" and scan again.`;
  }
  if (s.timeout > failed / 2) {
    return `${s.timeout} of ${s.tried} pages timed out, so most of your site couldn't be read. It may be slow right now — try scanning again later.`;
  }
  if (s.missing > failed / 2) {
    return `${s.missing} of ${s.tried} pages in your sitemap no longer exist. The chat still works from the rest, but your sitemap is out of date.`;
  }
  return `Only ${s.ok} of ${s.tried} pages could be read. The chat answers from those, but it is missing most of your site.`;
}

const sameHost = (url: string, host: string) => {
  try {
    const h = new URL(url).hostname;
    return h === host || h === `www.${host}` || `www.${h}` === host;
  } catch {
    return false;
  }
};

/** Sitemap <loc> entries on this host, else a shallow BFS from the homepage. */
async function discoverUrls(host: string, maxPages: number, stats?: FetchStats, robots?: Robots): Promise<string[]> {
  const base = `https://${host}`;
  const seen = new Set<string>([base, `${base}/`]);
  const keep = (u: string) =>
    sameHost(u, host) &&
    !/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|css|js|ico|xml)(\?|$)/i.test(u) &&
    !u.includes("#") &&
    // robots.txt is checked at DISCOVERY, so a disallowed page is never even
    // requested — obeying it by throwing the response away afterwards would
    // still have hit a server that asked us not to.
    (!robots || robots.allows(pathOf(u)));

  const sitemap = await fetchPage(`${base}/sitemap.xml`, stats);
  if (sitemap) {
    // Child sitemaps in useful-first order: a WP index lists post-sitemap
    // (the blog) before page- and product-sitemaps, and a page cap filled
    // with blog posts never reaches the products or the service pages —
    // exactly what happened on the pilot. Products first (they feed the
    // shelf), then pages (services/about), the blog last.
    const rank = (u: string) =>
      /product[^/]*-sitemap/i.test(u) ? 0 : /page-sitemap/i.test(u) ? 1 : /post-sitemap/i.test(u) ? 3 : 2;
    const locs = Array.from(sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (m) => m[1].trim())
      .sort((a, b) => rank(a) - rank(b));
    // A sitemap index points at more sitemaps; follow one level of those.
    const pages: string[] = [];
    for (const loc of locs) {
      if (pages.length >= maxPages) break;
      if (/sitemap[^/]*\.xml(\?|$)/i.test(loc)) {
        const child = await fetchPage(loc, stats);
        if (child) {
          for (const m of child.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
            if (pages.length >= maxPages) break;
            const u = m[1].trim();
            if (keep(u)) pages.push(u);
          }
        }
      } else if (keep(loc)) {
        pages.push(loc);
      }
    }
    if (pages.length) return Array.from(new Set([`${base}/`, ...pages])).slice(0, maxPages);
  }

  // No sitemap: homepage links, one level deep.
  const home = await fetchPage(`${base}/`, stats);
  if (!home) return [`${base}/`];
  const found: string[] = [`${base}/`];
  for (const m of home.matchAll(/href=["']([^"']+)["']/gi)) {
    if (found.length >= maxPages) break;
    let u = m[1];
    if (u.startsWith("/")) u = `${base}${u}`;
    if (!keep(u) || seen.has(u)) continue;
    seen.add(u);
    found.push(u);
  }
  return found;
}

/** HTML → readable text. Chrome (nav/header/footer) and machinery dropped. */
function pageToText(html: string): { title: string; text: string } {
  const title = decodeHtmlEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer)[\s\S]*?<\/\1>/gi, " ")
    // Block-level closers become paragraph breaks so chunking has seams.
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, "\n\n");
  const text = decodeHtmlEntities(sanitizeHtml(stripped, { allowedTags: [], allowedAttributes: {} }))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export type CrawledProduct = {
  url: string; name: string; price: string | null; image: string | null; description: string;
  /** The store's own product id, for handing a filled cart to its checkout. */
  externalId: string | null;
  /** Purchasable options behind one "From $X" page. */
  variations: { id: string; label: string; price: string; attributes: Record<string, string> }[];
  buyable: boolean;
};

/**
 * WooCommerce puts everything needed to build a real checkout link in the
 * product page's own markup — the post id on <body>, and the full variation
 * list (ids, prices, stock, attributes) in data-product_variations. Reading
 * it here means in-chat ordering works on any Woo store with NO plugin and
 * nothing for the merchant to install or configure.
 *
 * Anything not recognisably a store leaves these fields empty and the buy
 * buttons simply never appear.
 */
export function extractPurchase(html: string): Pick<CrawledProduct, "externalId" | "variations" | "buyable"> {
  const empty = { externalId: null, variations: [], buyable: false };

  const id =
    html.match(/\bpostid-(\d+)\b/)?.[1] ??
    html.match(/data-product_id=["'](\d+)["']/)?.[1] ??
    null;
  if (!id) return empty;

  // Simple product: purchasable if the page offers an add-to-cart at all.
  const hasCart = /add-to-cart|single_add_to_cart_button/i.test(html);

  const raw = html.match(/data-product_variations=["']([^"']+)["']/)?.[1];
  if (!raw) return { externalId: id, variations: [], buyable: hasCart };

  try {
    // Woo double-encodes this attribute, exactly like product names.
    const parsed = JSON.parse(decodeHtmlEntities(decodeHtmlEntities(raw)));
    if (!Array.isArray(parsed)) return { externalId: id, variations: [], buyable: hasCart };

    const variations = parsed
      .filter((v) => v && typeof v === "object" && v.is_purchasable !== false && v.is_in_stock !== false)
      .slice(0, 6)
      .flatMap((v) => {
        const vid = v.variation_id;
        if (typeof vid !== "number" && typeof vid !== "string") return [];
        const attributes: Record<string, string> = {};
        for (const [k, val] of Object.entries((v.attributes ?? {}) as Record<string, unknown>)) {
          if (typeof val === "string" && val) attributes[k] = val;
        }
        // The label the visitor picks by — the attribute values are what the
        // store itself shows in its dropdown ("Basic", "Large / Red").
        const label = Object.values(attributes).join(" / ") || "Buy";
        const amount = typeof v.display_price === "number" ? v.display_price : null;
        return [{
          id: String(vid),
          label: label.slice(0, 60),
          price: amount != null ? formatAmount(amount, v.currency_symbol) : "",
          attributes,
        }];
      });

    return { externalId: id, variations, buyable: hasCart && variations.length > 0 };
  } catch {
    return { externalId: id, variations: [], buyable: hasCart };
  }
}

/** Display only — never arithmetic, and the symbol comes from the store. */
function formatAmount(amount: number, symbol: unknown): string {
  const sym = typeof symbol === "string" && symbol.length <= 4 ? decodeHtmlEntities(symbol) : "$";
  return `${sym}${amount % 1 === 0 ? amount : amount.toFixed(2)}`;
}

/** Shopify announces itself in every page it renders. */
export function isShopify(html: string): boolean {
  return /cdn\.shopify\.com|\/cdn\/shop\/|Shopify\.theme|ShopifyAnalytics/i.test(html);
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "\u20AC", GBP: "\u00A3", CAD: "CA$", AUD: "A$", NZD: "NZ$" };

/** The store's own currency, for displaying variant prices. */
export function shopifyCurrencySymbol(html: string): string {
  const code =
    html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    "USD";
  return SYMBOLS[code] ?? `${code} `;
}

/**
 * Shopify's purchase data, from the public product JSON every storefront
 * serves at /products/{handle}.js — no key, no plugin, no merchant action,
 * exactly like reading Woo's markup. It carries the variant ids, their
 * names, prices in cents and an explicit in-stock flag, which makes "don't
 * offer what they can't buy" more reliable here than anywhere else.
 *
 * One extra small request per product page, and only on Shopify sites.
 */
export async function shopifyPurchase(
  productUrl: string,
  symbol: string
): Promise<Pick<CrawledProduct, "externalId" | "variations" | "buyable">> {
  const empty = { externalId: null, variations: [], buyable: false };
  const base = productUrl.split(/[?#]/)[0].replace(/\/$/, "");
  if (!/\/products\/[^/]+$/.test(base)) return empty; // not a product page

  const body = await fetchPage(`${base}.js`);
  if (!body) return empty;

  try {
    const d = JSON.parse(body) as Record<string, unknown>;
    const id = d.id;
    if (typeof id !== "number" && typeof id !== "string") return empty;

    const variations = (Array.isArray(d.variants) ? d.variants : [])
      .filter((v) => v && typeof v === "object" && (v as Record<string, unknown>).available !== false)
      .slice(0, 6)
      .flatMap((raw) => {
        const v = raw as Record<string, unknown>;
        const vid = v.id;
        if (typeof vid !== "number" && typeof vid !== "string") return [];
        const cents = typeof v.price === "number" ? v.price : null;
        return [{
          id: String(vid),
          // "8" / "Large / Blue" — Shopify's own variant title.
          label: (typeof v.title === "string" && v.title ? v.title : "Buy").slice(0, 60),
          price: cents != null ? `${symbol}${(cents / 100) % 1 === 0 ? cents / 100 : (cents / 100).toFixed(2)}` : "",
          // Shopify needs only the variant id; there are no attribute params.
          attributes: {} as Record<string, string>,
        }];
      });

    return { externalId: String(id), variations, buyable: variations.length > 0 };
  } catch {
    return empty;
  }
}

/** The store's checkout slug, which is customisable. Null = use the default. */
export function extractCheckoutPath(html: string, host: string): string | null {
  for (const m of html.matchAll(/href=["']([^"']*\/checkout[^"']*)["']/gi)) {
    try {
      const u = new URL(m[1], `https://${host}`);
      if (u.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "")) continue;
      if (/\/checkout\/?$/.test(u.pathname)) return u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    } catch { /* not a URL */ }
  }
  return null;
}

const MAX_PRODUCTS = 100;

/**
 * Harvest Product JSON-LD from a page. WooCommerce, Shopify, BigCommerce and
 * every SEO plugin emit it, which makes this the one reliable, deterministic
 * "does this site sell things" signal — no config, no guessing. The JSON is
 * third-party input: parsed defensively, strings truncated, anything that
 * doesn't look like a product ignored.
 */
export function extractProducts(html: string, pageUrl: string): CrawledProduct[] {
  const out: CrawledProduct[] = [];
  // Purchase data belongs to the PAGE, not to each JSON-LD block: a product
  // detail page describes one product and carries one add-to-cart form. On a
  // listing page there is no form, so nothing becomes buyable — which is
  // right, since a listing can't tell us which variation anyone wants.
  const purchase = extractPurchase(html);
  // Numbers too: WooCommerce emits "price":249 as a JSON number, not a
  // string — verified on rodeo.graphics, where string-only parsing silently
  // dropped every price. Decode TWICE: Woo double-encodes ("&amp;amp;"), and
  // these strings render through React (never innerHTML), so resurrection of
  // markup is cosmetic-safe here in a way it is not in lib/sanitize.
  const asText = (v: unknown): string =>
    typeof v === "string" ? decodeHtmlEntities(decodeHtmlEntities(v)).trim() : typeof v === "number" ? String(v) : "";
  const firstStr = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return firstStr(v[0]);
    if (v && typeof v === "object" && "url" in (v as object)) return firstStr((v as { url: unknown }).url);
    return "";
  };

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object" || out.length >= 20) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (isProduct) {
      const name = asText(obj.name).slice(0, 120);
      if (name) {
        const offers = (Array.isArray(obj.offers) ? obj.offers[0] : obj.offers) as Record<string, unknown> | undefined;
        // Offer.price, AggregateOffer.lowPrice, or a nested priceSpecification
        // — the three shapes real stores emit. lowPrice renders as "From".
        const direct = offers ? asText(offers.price) || asText((offers.priceSpecification as Record<string, unknown> | undefined)?.price) : "";
        const low = !direct && offers ? asText(offers.lowPrice) : "";
        const rawPrice = direct || low;
        const currency = offers ? asText(offers.priceCurrency) : "";
        const formatted = rawPrice ? (currency === "USD" || !currency ? `$${rawPrice.replace(/^\$/, "")}` : `${rawPrice} ${currency}`) : null;
        const price = formatted && low ? `From ${formatted}` : formatted;
        out.push({ ...purchase,
          url: firstStr(offers?.url) || firstStr(obj.url) || pageUrl,
          name,
          price,
          image: firstStr(obj.image) || null,
          description: asText(obj.description).slice(0, 500),
        });
      }
    }
    // @graph and nested structures
    for (const key of ["@graph", "itemListElement", "item", "mainEntity"]) {
      if (key in obj) visit(obj[key]);
    }
  };

  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1])); } catch { /* malformed block — skip */ }
  }
  return out;
}

function chunkText(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const para of text.split(/\n\n+/)) {
    if (current.length + para.length > CHUNK_TARGET && current.length >= CHUNK_MIN) {
      out.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current.trim().length >= CHUNK_MIN) out.push(current.trim());
  return out;
}

/**
 * The whole crawl: discover → fetch → chunk → embed → replace the site's
 * chunks in one transaction. Returns what the UI shows. Throws never — the
 * error lands on WidgetSite.crawlError instead.
 */
export async function crawlSite(siteId: string, host: string, maxPages = FREE_LIMITS.pages): Promise<{ pages: number; chunks: number; products: number; error: string | null }> {
  let pages = 0;
  let error: string | null = null;
  const rows: { url: string; title: string; content: string }[] = [];
  const products: CrawledProduct[] = [];
  const seenProductNames = new Set<string>();
  let checkoutPath: string | null = null;
  let storeKind: string | null = null;
  const stats = newFetchStats();

  try {
    // Asked once, before anything else is fetched. A site that says "not
    // here" gets to mean it, and its declared sitemaps are usually more
    // complete than guessing /sitemap.xml.
    const robots = await loadRobots(host, signedHeaders(`https://${host}/robots.txt`));
    const urls = await discoverUrls(host, maxPages, stats, robots);
    for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
      const batch = await Promise.all(urls.slice(i, i + FETCH_CONCURRENCY).map(async (url) => ({ url, html: await fetchPage(url, stats) })));
      for (const { url, html } of batch) {
        if (!html) continue;
        // Products first — listing pages can carry Product JSON-LD while
        // having little readable text.
        const shopify = isShopify(html);
        if (shopify) storeKind = "shopify";
        for (const p of extractProducts(html, url)) {
          if (products.length >= MAX_PRODUCTS) break;
          const key = p.name.toLowerCase();
          if (seenProductNames.has(key)) continue; // same product on listing + detail page
          seenProductNames.add(key);
          // Woo's data is already in the markup; Shopify's needs one small
          // extra fetch, so it only happens on a Shopify product page.
          if (shopify && !p.externalId) {
            Object.assign(p, await shopifyPurchase(p.url, shopifyCurrencySymbol(html)));
          }
          if (!storeKind && p.externalId) storeKind = "woocommerce";
          products.push(p);
        }
        if (!checkoutPath) checkoutPath = extractCheckoutPath(html, host);
        const { title, text } = pageToText(html);
        if (text.length < CHUNK_MIN) continue;
        pages++;
        for (const content of chunkText(text)) {
          if (rows.length >= MAX_CHUNKS) break;
          rows.push({ url, title, content });
        }
      }
      if (rows.length >= MAX_CHUNKS) break;
    }
    if (pages === 0) error = "Couldn't read any pages — is the site up and public?";
    // A crawl that reached one page out of two hundred is not a success with
    // a small number in it. Say what happened, in words the owner can act on.
    else error = crawlWarning(stats);
  } catch (err) {
    error = err instanceof Error ? err.message : "Crawl failed.";
  }

  // Embed in batches; a failed batch leaves those chunks unembedded (they
  // simply don't retrieve) rather than failing the crawl.
  const embeddings: (number[] | null)[] = new Array(rows.length).fill(null);
  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = await embedBatch(rows.slice(i, i + EMBED_BATCH_SIZE).map((r) => `${r.title}\n\n${r.content}`));
    if (batch) batch.forEach((e, j) => (embeddings[i + j] = e ?? null));
  }

  const productEmbeddings: (number[] | null)[] = new Array(products.length).fill(null);
  for (let i = 0; i < products.length; i += EMBED_BATCH_SIZE) {
    const batch = await embedBatch(products.slice(i, i + EMBED_BATCH_SIZE).map((p) => `${p.name}\n${p.description}`));
    if (batch) batch.forEach((e, j) => (productEmbeddings[i + j] = e ?? null));
  }

  // NOT one transaction: hundreds of statements inside an interactive tx
  // through the pooler is exactly what P2028s. Both tables are a cache of
  // someone else's site — a crawl that dies mid-write is fully repaired by
  // the next crawl, so plain sequential writes are the honest shape.
  await prisma.siteChunk.deleteMany({ where: { siteId } });
  for (let i = 0; i < rows.length; i++) {
    const created = await prisma.siteChunk.create({ data: { siteId, ...rows[i] }, select: { id: true } });
    const e = embeddings[i];
    if (e) {
      await prisma.$executeRawUnsafe(`UPDATE "SiteChunk" SET embedding = $1::vector WHERE id = $2`, `[${e.join(",")}]`, created.id);
    }
  }
  await prisma.siteProduct.deleteMany({ where: { siteId } });
  for (let i = 0; i < products.length; i++) {
    const { variations, ...rest } = products[i];
    const created = await prisma.siteProduct.create({
      data: { siteId, ...rest, variations: variations.length ? variations : undefined },
      select: { id: true },
    });
    const e = productEmbeddings[i];
    if (e) {
      await prisma.$executeRawUnsafe(`UPDATE "SiteProduct" SET embedding = $1::vector WHERE id = $2`, `[${e.join(",")}]`, created.id);
    }
  }
  await prisma.widgetSite.update({
    where: { id: siteId },
    data: { pagesCrawled: pages, crawledAt: new Date(), crawlError: error, checkoutPath, storeKind },
  });

  return { pages, chunks: rows.length, products: products.length, error };
}
