/**
 * Where publication cover thumbnails live, and how a stored path becomes a URL.
 *
 * Same contract as lib/portfolio/storage.ts and lib/company/storage.ts: the
 * database stores the storage PATH ("{profileId}/{uuid}.jpg"), never a full
 * URL, so moving bucket or CDN is a change to this one function rather than a
 * data migration.
 */

export const PUBLICATION_BUCKET = "publications";

/** The bucket is public, so this is a plain CDN URL — no signing per image. */
export function publicationImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${PUBLICATION_BUCKET}/${path}`;
}
