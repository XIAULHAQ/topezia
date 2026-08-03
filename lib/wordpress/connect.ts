/**
 * The WordPress handshake, in one place: tokens, expiry, and the shape of
 * what a WordPress site is allowed to tell us about itself.
 *
 * THE ONE RULE THAT MATTERS. Everything in `WpSiteDetails` arrived over HTTPS
 * from a stranger's server. HTTPS proves nobody tampered with it in transit;
 * it proves nothing whatsoever about whether it is true. So details are
 * sanitised on arrival, shown to a human to approve, and sanitised AGAIN on
 * use. They may never be written to a company profile without someone having
 * looked at them — a plugin that could silently rewrite the "about" text on a
 * public company page would be a defacement tool.
 *
 * The second rule: the site key never travels through a browser URL. The
 * plugin registers server-to-server and holds a one-time claim token; the
 * browser only ever carries `state`, which authorizes nothing.
 */
import { createHash, randomBytes } from "crypto";

/**
 * How long a pending connection stays claimable.
 *
 * This was an hour, on the reasoning that an approval can survive a phone call
 * but an abandoned one should be rubbish by lunchtime. That reasoning assumed
 * the approval happens in one sitting. It does not, for the case that now
 * matters most: someone arriving from the WordPress directory has no Topezia
 * account, so they create one mid-handshake, and email confirmation is on.
 * The confirmation link brings them straight back here — but only if they open
 * their mail within the window. People who check email twice a day were losing
 * a connection they had already approved of, and being told to start again.
 *
 * A day, because that is roughly how long the confirmation link they are
 * waiting on lives. Anything shorter re-creates the problem for someone who
 * signs up in the evening.
 *
 * WHAT THE WINDOW IS ACTUALLY GUARDING. `state` authorizes nothing by itself —
 * approving requires a signed-in account, and the site key never travels
 * through the browser. The bound risk is a stale `state` sitting in the
 * history of a shared computer, where a DIFFERENT signed-in person could bind
 * the site to their own account. That is real, so this stays a window rather
 * than becoming no expiry at all; a day of it is a trade worth making against
 * a flow that was failing honest people daily.
 *
 * The plugin does not second-guess this: it keeps its half of the handshake
 * until the server says 404/410, so changing this number here changes the real
 * behaviour with no plugin release.
 */
export const CONNECT_TTL_MS = 24 * 60 * 60 * 1000;

/** A one-time secret and the digest we keep instead of it. */
export function mintToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time-ish compare on digests of fixed length. */
export function sameToken(token: string, hash: string): boolean {
  const a = hashToken(token);
  if (a.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/**
 * What the plugin may tell us. Everything optional — a site with no logo and
 * no about page must connect exactly as well as a complete one, it just has
 * less to prefill.
 */
export type WpSiteDetails = {
  name: string | null;
  tagline: string | null;
  about: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  locale: string | null;
  /** "woocommerce" when the shop plugin is active, else null. */
  store: string | null;
  currency: string | null;
  /** Versions, for support triage and for knowing what the chat can offer. */
  wp: string | null;
  php: string | null;
  plugin: string | null;
  /** Rough size of the site, so the crawl page budget can be explained. */
  posts: number | null;
  pages: number | null;
  products: number | null;
};

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  // Control characters strip out rather than being escaped later — they have
  // no business in a company name and every business in an injection attempt.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Paragraphs survive; runs of blank lines don't. */
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s ? s.slice(0, max) : null;
};

const cleanEmail = (v: unknown): string | null => {
  const s = clean(v, 200)?.toLowerCase() ?? null;
  return s && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : null;
};

/**
 * An http(s) URL on a public host, or null. Refuses private and loopback
 * addresses by name: the logo URL is one we will FETCH server-side, and a
 * fetch of "http://169.254.169.254/..." on our infrastructure is the classic
 * cloud-metadata SSRF. DNS can still point a public name at a private
 * address, so the fetch itself stays cheap, capped and non-fatal.
 */
export function publicHttpUrl(v: unknown): string | null {
  const s = clean(v, 500);
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "0.0.0.0" ||
    host.startsWith("[")
  ) {
    return null;
  }
  return u.toString();
}

const count = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 10_000_000) : null;
};

export function sanitizeDetails(raw: unknown): WpSiteDetails {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: clean(d.name, 120),
    tagline: clean(d.tagline, 160),
    // The same ceiling as the company About field, so nothing is silently
    // truncated later at a different length.
    about: cleanText(d.about, 4000),
    email: cleanEmail(d.email),
    phone: clean(d.phone, 40),
    address: clean(d.address, 200),
    logoUrl: publicHttpUrl(d.logoUrl),
    locale: clean(d.locale, 20),
    store: d.store === "woocommerce" ? "woocommerce" : null,
    currency: clean(d.currency, 10),
    wp: clean(d.wp, 20),
    php: clean(d.php, 20),
    plugin: clean(d.plugin, 20),
    posts: count(d.posts),
    pages: count(d.pages),
    products: count(d.products),
  };
}

/**
 * Where we are allowed to send the person back to. It must be on the SAME
 * ORIGIN as the site that asked — an approval screen that will redirect
 * anywhere a stranger names is a phishing launcher, and this one is reached
 * while signed in.
 */
export function safeReturnUrl(returnUrl: unknown, siteUrl: string): string | null {
  const s = clean(returnUrl, 500);
  if (!s) return null;
  try {
    const back = new URL(s);
    const site = new URL(siteUrl);
    if (back.protocol !== "https:" && back.protocol !== "http:") return null;
    return back.host === site.host ? back.toString() : null;
  } catch {
    return null;
  }
}

/** Human summary of what the plugin found, for the approval screen. */
export function detailCount(d: WpSiteDetails): number {
  return [d.name, d.tagline, d.about, d.email, d.phone, d.address, d.logoUrl].filter(Boolean).length;
}
