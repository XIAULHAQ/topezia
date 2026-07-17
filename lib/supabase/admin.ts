/**
 * Server-only Supabase admin client (service-role key).
 *
 * The service-role key bypasses row-level security and can manage auth users,
 * so it MUST never reach the browser — only import this from server code
 * (route handlers, server actions). It is not NEXT_PUBLIC_*.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't set, so callers degrade
 * gracefully: account deletion still removes all profile data, it just can't
 * remove the auth user itself until the key is configured.
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
