/**
 * Content-Security-Policy for every page.
 *
 * The point is script-src: no external script may load and no plugin/object can
 * run, so an injected tag (the classic stored-XSS payload on a site that renders
 * third-party job HTML) has nowhere to pull code from. 'unsafe-inline' stays —
 * Next's own bootstrap is inline and the app has no nonce plumbing — so this is
 * defense-in-depth behind sanitize-html/safeJsonLd, not a substitute for them.
 *
 * The generous corners are deliberate:
 *  - img-src https:  — job/company logos come from arbitrary crawled hosts,
 *    member photos from Supabase storage or LinkedIn's CDN, plus data: URIs
 *    for extracted resume photos.
 *  - frame-src       — portfolio video embeds (YouTube nocookie, Vimeo).
 *  - connect-src     — Supabase auth/storage and PostHog ingestion.
 *  - 'unsafe-eval' in dev only: webpack eval sourcemaps need it; prod doesn't.
 */
const dev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  // challenges.cloudflare.com: Turnstile on the signup form. Loaded only when
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (app/_components/Turnstile.tsx), but
  // the CSP has to allow it unconditionally — a header can't read that env var
  // per-request, and allowing a host is not the same as loading from it.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://*.posthog.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com",
  // Turnstile renders its challenge in an iframe, so it needs frame-src too.
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Vercel sets HSTS on custom domains too; repeating it costs nothing and
  // keeps the guarantee if the host ever changes. No includeSubDomains — other
  // subdomains of the apex aren't ours to force onto HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/**
 * The chat widget page (/widget/{token}) is the ONE surface built to be
 * iframed on other people's websites, so it can't carry frame-ancestors
 * 'none' / X-Frame-Options DENY. Multiple CSP headers intersect (most
 * restrictive wins), so the widget route must be EXCLUDED from the catch-all
 * and given its own set — overriding wouldn't relax anything. Everything else
 * keeps the strict headers. The page itself holds no session-authenticated
 * actions: the token in its URL identifies a site, never authorizes one.
 */
const WIDGET_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors *");
/**
 * The widget also needs the MICROPHONE, for voice input. The site-wide policy
 * is `microphone=()` — an EMPTY allowlist, which forbids it to every origin
 * including ourselves, so the mic button did nothing at all until this
 * existed. `(self)` grants it to this document's own origin only; the host
 * page still has to delegate it with allow="microphone" on the iframe
 * (public/widget.js), and the visitor is still asked by the browser.
 * Camera, geolocation and payment stay fully off.
 */
const WIDGET_PERMISSIONS = "camera=(), microphone=(self), geolocation=(), payment=()";
const WIDGET_HEADERS = SECURITY_HEADERS.filter(
  (h) => !["Content-Security-Policy", "X-Frame-Options", "Permissions-Policy"].includes(h.key)
).concat([
  { key: "Content-Security-Policy", value: WIDGET_CSP },
  { key: "Permissions-Policy", value: WIDGET_PERMISSIONS },
]);

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: "/((?!widget/).*)", headers: SECURITY_HEADERS },
      { source: "/widget/:path*", headers: WIDGET_HEADERS },
    ];
  },
  experimental: {
    /**
     * Keep the PDF stack out of the webpack bundle.
     *
     * pdf-parse pulls in pdfjs-dist, whose ESM build doesn't survive webpack's
     * server bundling — it throws "Object.defineProperty called on non-object"
     * the moment the résumé-upload route imports it. Marking these external
     * makes Node require() them from node_modules at runtime, which is how
     * pdfjs expects to be loaded.
     *
     * (Next 15 renames this to `serverExternalPackages`.)
     */
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
  },
};

module.exports = nextConfig;
