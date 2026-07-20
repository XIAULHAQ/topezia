/**
 * Where portfolio images live, and how a stored path becomes a URL.
 *
 * The database stores the storage PATH ("{profileId}/{uuid}.jpg"), never a full
 * URL. If the origin or bucket ever changes, or images move behind a different
 * CDN, that is one function here rather than a data migration over every row.
 */

export const PORTFOLIO_BUCKET = "portfolio";

/** The bucket is public, so this is a plain CDN URL — no signing per image. */
export function portfolioImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${PORTFOLIO_BUCKET}/${path}`;
}
