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

const PAGE_TIMEOUT_MS = 10_000;
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

async function fetchPage(url: string): Promise<string | null> {
  // The timer must cover the BODY read, not just the headers, and an
  // early-returned response must have its body cancelled: an abandoned
  // undici stream that later errors (remote reset, timeout) throws an
  // UNCAUGHT "terminated" TypeError with no promise to reject into — it
  // crashed the first live crawl, not a request that was awaited.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "TopeziaWidget/1.0 (+https://www.topezia.com)" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || (!type.includes("html") && !type.includes("xml") && !type.includes("text"))) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const text = await res.text();
    return text.length > PAGE_MAX_BYTES ? text.slice(0, PAGE_MAX_BYTES) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
async function discoverUrls(host: string): Promise<string[]> {
  const base = `https://${host}`;
  const seen = new Set<string>([base, `${base}/`]);
  const keep = (u: string) =>
    sameHost(u, host) && !/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|css|js|ico|xml)(\?|$)/i.test(u) && !u.includes("#");

  const sitemap = await fetchPage(`${base}/sitemap.xml`);
  if (sitemap) {
    const locs = Array.from(sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (m) => m[1].trim());
    // A sitemap index points at more sitemaps; follow one level of those.
    const pages: string[] = [];
    for (const loc of locs) {
      if (pages.length >= FREE_LIMITS.pages) break;
      if (/sitemap[^/]*\.xml(\?|$)/i.test(loc)) {
        const child = await fetchPage(loc);
        if (child) {
          for (const m of child.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
            if (pages.length >= FREE_LIMITS.pages) break;
            const u = m[1].trim();
            if (keep(u)) pages.push(u);
          }
        }
      } else if (keep(loc)) {
        pages.push(loc);
      }
    }
    if (pages.length) return Array.from(new Set([`${base}/`, ...pages])).slice(0, FREE_LIMITS.pages);
  }

  // No sitemap: homepage links, one level deep.
  const home = await fetchPage(`${base}/`);
  if (!home) return [`${base}/`];
  const found: string[] = [`${base}/`];
  for (const m of home.matchAll(/href=["']([^"']+)["']/gi)) {
    if (found.length >= FREE_LIMITS.pages) break;
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
export async function crawlSite(siteId: string, host: string): Promise<{ pages: number; chunks: number; error: string | null }> {
  let pages = 0;
  let error: string | null = null;
  const rows: { url: string; title: string; content: string }[] = [];

  try {
    const urls = await discoverUrls(host);
    for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
      const batch = await Promise.all(urls.slice(i, i + FETCH_CONCURRENCY).map(async (url) => ({ url, html: await fetchPage(url) })));
      for (const { url, html } of batch) {
        if (!html) continue;
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

  // NOT one transaction: hundreds of statements inside an interactive tx
  // through the pooler is exactly what P2028s. The chunk table is a cache of
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
  await prisma.widgetSite.update({
    where: { id: siteId },
    data: { pagesCrawled: pages, crawledAt: new Date(), crawlError: error },
  });

  return { pages, chunks: rows.length, error };
}
