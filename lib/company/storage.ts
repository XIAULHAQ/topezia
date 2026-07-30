/**
 * Where company logos live, and how a stored path becomes a URL.
 *
 * Same contract as lib/portfolio/storage.ts: the database stores the storage
 * PATH ("{companyId}/{uuid}.png"), never a full URL, so moving bucket or CDN
 * is a change to this one function rather than a data migration.
 */

export const LOGO_BUCKET = "logos";

/**
 * Work images and article covers (migration 045). Its own bucket rather than a
 * folder in `logos`: the two have different size limits and different cleanup
 * paths — see scripts/setup-company-storage.sql.
 *
 * Client logos are the exception and stay in `logos`, under
 * "{companyId}/clients/", because that is what they are.
 */
export const COMPANY_BUCKET = "company";

function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

/** The bucket is public, so this is a plain CDN URL — no signing per image. */
export function companyLogoUrl(path: string | null | undefined): string | null {
  return publicUrl(LOGO_BUCKET, path);
}

/** Work covers, work gallery images, article covers. */
export function companyImageUrl(path: string | null | undefined): string | null {
  return publicUrl(COMPANY_BUCKET, path);
}

/**
 * The origin every image we host is served from. sanitizeUgcHtml uses this to
 * refuse remote <img> in company articles: a foreign image URL on a page we
 * host is a tracking pixel and a hotlink, and the editor only ever inserts
 * images it uploaded through us.
 */
export function storageOrigin(): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}
