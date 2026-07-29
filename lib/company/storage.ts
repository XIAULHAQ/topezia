/**
 * Where company logos live, and how a stored path becomes a URL.
 *
 * Same contract as lib/portfolio/storage.ts: the database stores the storage
 * PATH ("{companyId}/{uuid}.png"), never a full URL, so moving bucket or CDN
 * is a change to this one function rather than a data migration.
 */

export const LOGO_BUCKET = "logos";

/** The bucket is public, so this is a plain CDN URL — no signing per image. */
export function companyLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}
