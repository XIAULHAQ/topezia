/**
 * Shared client-side fetch for /api/profile.
 *
 * The app shell needs the name and photo for the avatar; the feed needs the
 * preferences. Both mount together, so /feed was requesting the same endpoint
 * TWICE in parallel — and each authenticated request costs a Supabase auth
 * round-trip plus a profile query, so the duplicate was measured at 2.4-3.6s
 * of entirely redundant work.
 *
 * Dedupes only requests that are IN FLIGHT together, and deliberately does not
 * cache the result: a longer-lived cache would keep serving the old name and
 * photo after someone edits their profile.
 */
type ProfileResponse = { profile?: Record<string, unknown> | null } | null;

let inflight: Promise<ProfileResponse> | null = null;

export function fetchProfileShared(): Promise<ProfileResponse> {
  if (inflight) return inflight;
  inflight = fetch("/api/profile")
    .then((r) => (r.ok ? (r.json() as Promise<ProfileResponse>) : null))
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}
