/**
 * Whose profile is this? — resolves the id used for Profile.userId.
 *
 * Prefers the Supabase-authenticated user id (a real account, survives
 * cookie-clears and works cross-device). Falls back to the anonymous-session
 * cookie so the "no account needed to start" flow still works (spec §6.1).
 * On sign-in, the anon profile is migrated to the auth id — see
 * app/api/auth/link/route.ts.
 */
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ANON_COOKIE } from "@/lib/anon-session";

export async function currentIdentity(): Promise<{ userId: string | null; authed: boolean }> {
  try {
    const supabase = createClient();
    // getClaims verifies the JWT's ES256 signature locally against the cached
    // JWKS instead of calling Supabase's auth server per request (see
    // middleware.ts for the full rationale — same change, same trade). The
    // token's `sub` is the user id getUser() would have returned.
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (sub) return { userId: sub, authed: true };
  } catch {
    // Supabase not reachable / not configured — fall through to anon.
  }
  const anon = cookies().get(ANON_COOKIE)?.value ?? null;
  return { userId: anon, authed: false };
}
