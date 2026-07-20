/**
 * Make sure the access token is fresh BEFORE firing authenticated requests.
 *
 * The problem this replaces: several API calls going out together would each
 * hit a server that decided the token needed refreshing, and they would each
 * refresh using the same refresh token. Supabase rotates it on first use, so
 * one won and the rest got "Invalid Refresh Token: Already Used" — killing the
 * session. The symptom was the feed rendering fine and the NEXT gated page
 * bouncing to /login.
 *
 * The first fix was to serialize: send one request, wait, then send the rest.
 * It worked, and it cost 2.8s on every dashboard load (measured: 2.1s -> 5.0s)
 * because a full round-trip was inserted ahead of everything.
 *
 * This does the same job without the wait. Refreshing is handled HERE, in the
 * browser client, which serializes refreshes across tabs via the Web Locks API
 * and writes the rotated tokens back itself — so the server never has to
 * refresh, and there is nothing for parallel requests to race over.
 *
 * The common case costs nothing: getSession() reads local storage without a
 * network call, sees a token with time left, and returns. Only an actually-due
 * refresh pays for a request, and then exactly one.
 */
import { createClient } from "@/lib/supabase/client";

/** Refresh this far ahead of expiry, so a request in flight can't cross it. */
const REFRESH_MARGIN_MS = 90_000;

let inflight: Promise<void> | null = null;

export function ensureFreshSession(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return; // anonymous — nothing to keep fresh
      const expiresAtMs = (session.expires_at ?? 0) * 1000;
      if (expiresAtMs - Date.now() > REFRESH_MARGIN_MS) return; // still good
      await supabase.auth.refreshSession();
    } catch {
      // Never block the page on this. If the refresh fails the request that
      // follows will get a 401 and the normal auth handling takes over.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
