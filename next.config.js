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
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://*.posthog.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
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
