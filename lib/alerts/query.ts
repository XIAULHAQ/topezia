/**
 * Saved-search resolution for email alerts (spec §7 capture, §9 delivery).
 *
 * An alert is just an SEO page's query, remembered. The subscribe API resolves
 * the page's slug server-side (never trusting client-supplied ids), and the
 * sender replays the same filter to find what's new.
 *
 * NOTE: the URL scheme here mirrors lib/seo/pages.ts — if the /jobs/* scheme
 * changes, change both.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma, RemoteType } from "@prisma/client";
import { stateName, countryName, isoForCountrySlug } from "@/lib/seo/pages";
import { regionsCovering } from "@/lib/matching/eligibility";

const REMOTE_PREFIX = "remote-";
const REMOTE_TYPES: RemoteType[] = ["REMOTE_US", "REMOTE_GLOBAL"];

export interface AlertTarget {
  label: string; // "Account Executive jobs in California"
  roleId: string | null;
  verticalId: string | null;
  locationState: string | null;
  country: string | null;
  remoteOnly: boolean;
}

/** Deterministic dedup key — (email, queryKey) is unique. */
export function alertQueryKey(t: AlertTarget): string {
  return [
    `role:${t.roleId ?? "-"}`,
    `vert:${t.verticalId ?? "-"}`,
    `state:${t.locationState ?? "-"}`,
    `country:${t.country ?? "-"}`,
    `remote:${t.remoteOnly ? 1 : 0}`,
  ].join("|");
}

/** The Job filter this alert watches; `since` scopes it to what's new.
 *
 *  A country alert mirrors the feed's eligibility clause (lib/matching/
 *  eligibility.ts): jobs IN the country, plus remote jobs open to it —
 *  GLOBAL, the country itself, or a region covering it. The strict
 *  `country =` filter silently dropped every remote job a subscriber could
 *  actually take. Deliberately NOT mirrored: the feed's "location unknown"
 *  branch — a browsing surface can afford maybes, a push email claiming
 *  "new jobs for you" cannot. */
export function alertWhere(t: AlertTarget, since?: Date | null): Prisma.JobWhereInput {
  return {
    status: "LIVE",
    ...(t.roleId ? { roleId: t.roleId } : {}),
    ...(t.verticalId ? { verticalId: t.verticalId } : {}),
    ...(t.locationState ? { locationState: t.locationState } : {}),
    ...(t.country
      ? {
          OR: [
            { country: t.country },
            { remoteScope: "GLOBAL" },
            { remoteScope: t.country },
            { remoteScope: { in: regionsCovering([t.country]) } },
          ],
        }
      : {}),
    ...(t.remoteOnly ? { remoteType: { in: REMOTE_TYPES } } : {}),
    ...(since ? { firstSeenAt: { gt: since } } : {}),
  };
}

/**
 * Resolve a /jobs/* slug (+ optional place) into an alert target.
 *
 * `place` is a US state code or a country slug, matching the page URL. Without
 * the country branch a Germany page's signup silently became a worldwide alert.
 */
export async function resolveAlertTarget(slug: string, place?: string | null): Promise<AlertTarget | null> {
  const clean = slug.toLowerCase();

  if (place) {
    const iso = isoForCountrySlug(place);
    const country = iso ?? null;
    const locationState = iso ? null : place.toUpperCase();
    const placeName = iso ? countryName(iso) : stateName(place.toUpperCase());

    // Country labels say what the query now matches: in-country + remote
    // open to it. State pages stay literal — they have no remote clause.
    const placeLabel = iso ? `in ${placeName} or remote` : `in ${placeName}`;

    // Role + place (SEO role pages, and the feed's per-profile alert).
    const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
    if (role) {
      return { label: `${role.name} jobs ${placeLabel}`, roleId: role.id, verticalId: null, locationState, country, remoteOnly: false };
    }
    // Vertical + place (SEO field pages, and a field-scoped feed alert when the
    // person has no resolved role).
    const vertical = await prisma.vertical.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
    if (vertical && clean !== "unsorted") {
      return { label: `${vertical.name} jobs ${placeLabel}`, roleId: null, verticalId: vertical.id, locationState, country, remoteOnly: false };
    }
    return null;
  }

  if (clean.startsWith(REMOTE_PREFIX)) {
    const role = await prisma.role.findUnique({ where: { slug: clean.slice(REMOTE_PREFIX.length) }, select: { id: true, name: true } });
    if (!role) return null;
    return { label: `Remote ${role.name} jobs`, roleId: role.id, verticalId: null, locationState: null, country: null, remoteOnly: true };
  }

  const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
  if (role) return { label: `${role.name} jobs`, roleId: role.id, verticalId: null, locationState: null, country: null, remoteOnly: false };

  const vertical = await prisma.vertical.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
  if (vertical && clean !== "unsorted") {
    return { label: `${vertical.name} jobs`, roleId: null, verticalId: vertical.id, locationState: null, country: null, remoteOnly: false };
  }

  return null;
}
