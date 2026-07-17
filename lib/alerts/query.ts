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

/** The Job filter this alert watches; `since` scopes it to what's new. */
export function alertWhere(t: AlertTarget, since?: Date | null): Prisma.JobWhereInput {
  return {
    status: "LIVE",
    ...(t.roleId ? { roleId: t.roleId } : {}),
    ...(t.verticalId ? { verticalId: t.verticalId } : {}),
    ...(t.locationState ? { locationState: t.locationState } : {}),
    ...(t.country ? { country: t.country } : {}),
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
    const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
    if (!role) return null;

    const iso = isoForCountrySlug(place);
    if (iso) {
      return { label: `${role.name} jobs in ${countryName(iso)}`, roleId: role.id, verticalId: null, locationState: null, country: iso, remoteOnly: false };
    }
    const st = place.toUpperCase();
    return { label: `${role.name} jobs in ${stateName(st)}`, roleId: role.id, verticalId: null, locationState: st, country: null, remoteOnly: false };
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
