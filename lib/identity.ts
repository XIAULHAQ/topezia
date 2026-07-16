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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { userId: user.id, authed: true };
  } catch {
    // Supabase not reachable / not configured — fall through to anon.
  }
  const anon = cookies().get(ANON_COOKIE)?.value ?? null;
  return { userId: anon, authed: false };
}
