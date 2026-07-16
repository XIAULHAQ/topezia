/**
 * Supabase browser client (@supabase/ssr) for Client Components — used by the
 * /login page to sign up / sign in with email + password.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
