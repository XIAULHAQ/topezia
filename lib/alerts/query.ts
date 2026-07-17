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
import { stateName } from "@/lib/seo/pages";

const REMOTE_PREFIX = "remote-";
const REMOTE_TYPES: RemoteType[] = ["REMOTE_US", "REMOTE_GLOBAL"];

export interface AlertTarget {
  label: string; // "Account Executive jobs in California"
  roleId: string | null;
  verticalId: string | null;
  locationState: string | null;
  remoteOnly: boolean;
}

/** Deterministic dedup key — (email, queryKey) is unique. */
export function alertQueryKey(t: AlertTarget): string {
  return [
    `role:${t.roleId ?? "-"}`,
    `vert:${t.verticalId ?? "-"}`,
    `state:${t.locationState ?? "-"}`,
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
    ...(t.remoteOnly ? { remoteType: { in: REMOTE_TYPES } } : {}),
    ...(since ? { firstSeenAt: { gt: since } } : {}),
  };
}

/** Resolve a /jobs/* slug (+ optional state) into an alert target. */
export async function resolveAlertTarget(slug: string, state?: string | null): Promise<AlertTarget | null> {
  const clean = slug.toLowerCase();

  if (state) {
    const st = state.toUpperCase();
    const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
    if (!role) return null;
    return { label: `${role.name} jobs in ${stateName(st)}`, roleId: role.id, verticalId: null, locationState: st, remoteOnly: false };
  }

  if (clean.startsWith(REMOTE_PREFIX)) {
    const role = await prisma.role.findUnique({ where: { slug: clean.slice(REMOTE_PREFIX.length) }, select: { id: true, name: true } });
    if (!role) return null;
    return { label: `Remote ${role.name} jobs`, roleId: role.id, verticalId: null, locationState: null, remoteOnly: true };
  }

  const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
  if (role) return { label: `${role.name} jobs`, roleId: role.id, verticalId: null, locationState: null, remoteOnly: false };

  const vertical = await prisma.vertical.findUnique({ where: { slug: clean }, select: { id: true, name: true } });
  if (vertical && clean !== "unsorted") {
    return { label: `${vertical.name} jobs`, roleId: null, verticalId: vertical.id, locationState: null, remoteOnly: false };
  }

  return null;
}
