/**
 * SEO paths for job detail pages: /job/{title}-at-{company}-{uuid}.
 *
 * The uuid stays in the URL as the source of truth — the slug is display
 * only, so a title edit can never orphan a link and two same-titled jobs
 * can never collide. Old bare-uuid URLs (and stale slugs after an edit)
 * 301 to the current canonical in the page itself.
 */

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");

export function jobPath(j: { id: string; titleRaw: string; companyName: string }): string {
  const slug = slugify(`${j.titleRaw} at ${j.companyName}`);
  return slug ? `/job/${slug}-${j.id}` : `/job/${j.id}`;
}

const UUID_RX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The uuid out of a /job/ path param — slugged, bare, or garbage (null). */
export function extractJobId(param: string): string | null {
  const m = decodeURIComponent(param).match(UUID_RX);
  return m ? m[0].toLowerCase() : null;
}
