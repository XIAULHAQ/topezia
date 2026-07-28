/**
 * Where blog cover images live, and how a stored path becomes a URL.
 *
 * Same shape as lib/portfolio/storage.ts: the database stores the storage
 * PATH ("{uuid}.jpg"), never a full URL, so a bucket/CDN change is one
 * function here rather than a data migration over every row.
 */

export const BLOG_BUCKET = "blog";

/** The bucket is public, so this is a plain CDN URL — no signing per image. */
export function blogImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BLOG_BUCKET}/${path}`;
}
