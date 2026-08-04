/**
 * What a website says about itself in its own homepage markup.
 *
 * THE PROBLEM THIS SOLVES. The WordPress plugin reports the site's identity
 * from WordPress's own options — blogname, the tagline, the Custom Logo. On a
 * site whose metadata is managed by an SEO plugin those options are routinely
 * blank, because the SEO plugin holds the real values. valorieblanchard.com
 * connected with name, tagline, about and logo ALL empty, so the company came
 * out called "valorieblanchard.com" with nothing in it — while the homepage
 * plainly said `og:site_name: Valorie`, carried a real description, and the
 * crawler read a title and an About page seconds later.
 *
 * So this is the second opinion: the rendered page, which is the thing the
 * site's owner actually maintains. Used ONLY to fill blanks, never to
 * overwrite — same rule as the plugin's own details.
 *
 * Deliberately its own small fetch rather than a hook into the crawler: it
 * runs once, at connect time, and keeping it out of crawlSite means it cannot
 * slow down or break a re-scan.
 */
import { decodeHtmlEntities } from "@/lib/sanitize";

export type SiteIdentity = {
  name: string | null;
  /** Short enough to sit under a company name. */
  tagline: string | null;
  /** The site's description when it is too long to be a strapline — real prose
   *  worth keeping as About text rather than throwing away for being big. */
  description: string | null;
  logoUrl: string | null;
};

const EMPTY: SiteIdentity = { name: null, tagline: null, description: null, logoUrl: null };

/**
 * A favicon is not a logo.
 *
 * Sites that set no og:image still offer `<link rel=icon>`, and WordPress
 * serves those at 32×32 — teamequinety.com gave back
 * "cropped-equinety_logo-1-32x32.jpeg". Stretched onto a company page that is
 * a blurry square, which looks worse than the clean initials we fall back to.
 * apple-touch-icon is usually 180px+ and is worth taking; the tiny ones are not.
 */
const isTinyIcon = (u: string): boolean =>
  /[-_](16|24|32|48|64)x(16|24|32|48|64)\./i.test(u) || /\bfit=(16|24|32|48|64)(%2C|,)/i.test(u);

const meta = (html: string, attr: "property" | "name", key: string): string | null => {
  // content= can precede or follow the name/property, so try both orders.
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(new RegExp(`<meta[^>]+${attr}=["']${esc}["'][^>]+content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${esc}["']`, "i"));
  const v = (a?.[1] ?? b?.[1] ?? "").trim();
  return v ? decodeHtmlEntities(v) : null;
};

/**
 * The site's name out of a page title.
 *
 * Almost every SEO plugin writes "Page title | Site name" or "Page — Site",
 * so the LAST segment is the site. Only used when og:site_name is absent, and
 * only when the result is short enough to be a name rather than a sentence —
 * a title with no separator is the page's headline, not the brand, and
 * guessing there is worse than leaving it blank.
 */
function nameFromTitle(title: string): string | null {
  const parts = title.split(/\s+[|–—·»]\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  return last.length >= 2 && last.length <= 60 ? last : null;
}

export async function fetchSiteIdentity(host: string): Promise<SiteIdentity> {
  let html: string;
  try {
    const res = await fetch(`https://${host}/`, {
      headers: { "User-Agent": "TopeziaWidget/1.0 (+https://www.topezia.com)" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return EMPTY;
    // The identity lives in <head>; a huge body is not worth reading for it.
    html = (await res.text()).slice(0, 200_000);
  } catch {
    // Never let this break a connection that has already been approved.
    return EMPTY;
  }

  const title = decodeHtmlEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");

  const name =
    meta(html, "property", "og:site_name") ??
    meta(html, "name", "application-name") ??
    (title ? nameFromTitle(title) : null);

  const described =
    meta(html, "name", "description") ??
    meta(html, "property", "og:description");

  // Entities appear in href attributes too — rodeo.graphics serves its icon at
  // "?fit=32%2C32&#038;ssl=1", and an un-decoded &#038; makes the URL 404.
  const href = (re: RegExp): string | null => {
    const m = html.match(re);
    return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
  };

  const logoUrl =
    meta(html, "property", "og:logo") ??
    meta(html, "property", "og:image") ??
    href(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ??
    href(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ??
    null;

  const abs = (u: string | null): string | null => {
    if (!u) return null;
    try {
      return new URL(u, `https://${host}/`).toString();
    } catch {
      return null;
    }
  };

  return {
    name: name && name.length <= 120 ? name : null,
    // A description is a sentence; a tagline is a line. The long ones are not
    // rubbish, they are just the wrong shape for a strapline — so they come
    // back separately and the caller can use them as About text.
    tagline: described && described.length <= 160 ? described : null,
    description: described && described.length > 160 ? described.slice(0, 4000) : null,
    logoUrl: logoUrl && isTinyIcon(logoUrl) ? null : abs(logoUrl),
  };
}
