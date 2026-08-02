/**
 * Pull a WordPress site's logo into our own storage.
 *
 * WHY NOT JUST KEEP THE URL. Their media library is not a CDN we may lean
 * on: the file moves when they migrate host, disappears when they tidy up,
 * and every view of our public company page would otherwise be a request to
 * their server that we caused. A stored copy also means the same contract as
 * every other logo — a path in the `logos` bucket, turned into a URL by
 * lib/company/storage.ts.
 *
 * NOTHING HERE IS FATAL. A site with an unreachable logo connects fine and
 * simply has no logo; the person can upload one in ten seconds. So every
 * failure returns null and is logged, never thrown.
 *
 * The fetch is the one place this module touches a stranger's server, so it
 * is deliberately narrow: one request, no redirects off the original host
 * beyond what fetch follows, a hard timeout, a size ceiling checked against
 * the bytes actually read rather than the declared length, and a type
 * decided by SNIFFING MAGIC BYTES. A server that says "image/png" and sends
 * an SVG is describing an executable document, and serving one from our own
 * origin would be stored XSS.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, extensionFor } from "@/lib/portfolio/image";
import { LOGO_BUCKET } from "@/lib/company/storage";
import { publicHttpUrl } from "./connect";

const MAX_BYTES = 2 * 1024 * 1024; // matches the bucket's own limit
const TIMEOUT_MS = 8_000;

export async function fetchLogo(url: string, companyId: string): Promise<string | null> {
  // Re-checked here rather than trusted from the caller: this function is the
  // one that makes the outbound request, so it owns the SSRF decision.
  if (!publicHttpUrl(url)) return null;

  const admin = createAdminClient();
  if (!admin) {
    console.error("[wp-connect] logo skipped: SUPABASE_SERVICE_ROLE_KEY not set");
    return null;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "TopeziaWidget/1.0 (+https://www.topezia.com)" },
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    // The declared length is a hint worth acting on early, but the real
    // ceiling is the bytes we actually hold.
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      await res.body?.cancel();
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;

    const type = sniffImageType(buf);
    if (!type) return null; // not a JPG/PNG/WebP/AVIF — SVG lands here too

    const path = `${companyId}/${crypto.randomUUID()}.${extensionFor(type)}`;
    const { error } = await admin.storage.from(LOGO_BUCKET).upload(path, buf, {
      contentType: type,
      upsert: false,
    });
    if (error) {
      console.error("[wp-connect] logo upload failed:", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error("[wp-connect] logo fetch failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
