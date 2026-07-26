/**
 * Shared client-side fetch for /api/profile.
 *
 * The app shell needs the name and photo for the avatar; the feed needs the
 * preferences. Both mount together, so /feed was requesting the same endpoint
 * TWICE in parallel — and each authenticated request costs a Supabase auth
 * round-trip plus a profile query, so the duplicate was measured at 2.4-3.6s
 * of entirely redundant work.
 *
 * Dedupes requests that are IN FLIGHT together, and writes each fresh response
 * through to the session cache (lib/client-cache.ts). Consumers that want an
 * instant paint call readProfileCache() first and treat the fetch as the
 * refresh — the stale-name-after-edit problem the old no-cache rule guarded
 * against doesn't exist in that pattern, because the fresh response always
 * lands on top.
 */
import { readCache, writeCache } from "@/lib/client-cache";

type ProfileResponse = { profile?: Record<string, unknown> | null } | null;

let inflight: Promise<ProfileResponse> | null = null;

export function fetchProfileShared(): Promise<ProfileResponse> {
  if (inflight) return inflight;
  inflight = fetch("/api/profile")
    .then((r) => (r.ok ? (r.json() as Promise<ProfileResponse>) : null))
    .then((d) => {
      if (d?.profile) writeCache("/api/profile", d);
      return d;
    })
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}

/** Last session-cached /api/profile response, for instant hydration. */
export function readProfileCache(): ProfileResponse {
  return readCache<ProfileResponse>("/api/profile");
}
