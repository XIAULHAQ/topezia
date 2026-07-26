/**
 * Session-scoped stale-while-revalidate cache for the signed-in dashboard.
 *
 * The dashboard's data barely changes between two visits minutes apart, yet
 * every navigation re-fetched everything from a cold spinner. Pages hydrate
 * instantly from the last response and refresh in the background — the
 * spinner only exists on the first visit of a browser session.
 *
 * sessionStorage on purpose, not localStorage: it dies with the tab, so
 * personal data never outlives the session on a shared machine. clearClientCaches()
 * runs on the login page and on logout, so switching accounts in one tab can
 * never flash the previous account's data.
 */

const PREFIX = "tzc:";

export function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // private mode / quota / SSR — cache is always optional
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* best effort */
  }
}

export function clearClientCaches(): void {
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* best effort */
  }
}

/**
 * Fetch JSON with instant cache hydration: `apply` runs immediately with the
 * cached body when one exists, then again with the fresh one. Errors leave the
 * cached view in place — stale data beats an error state for optional panels.
 */
export async function cachedFetchJson<T>(url: string, apply: (data: T) => void): Promise<void> {
  const hit = readCache<T>(url);
  if (hit !== null) apply(hit);
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const d = (await r.json()) as T;
    writeCache(url, d);
    apply(d);
  } catch {
    /* keep the cached view */
  }
}
