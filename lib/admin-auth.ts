/**
 * MVP admin auth — a single shared secret, not a real auth system.
 *
 * This is intentionally minimal: at zero-to-few admin users (you), a full
 * role-based auth system is wasted Phase 1 budget. Set ADMIN_ACCESS_TOKEN
 * in your env, then either:
 *   - visit /admin/waitlist?token=YOUR_TOKEN once, which sets a cookie, or
 *   - call the API directly with an `Authorization: Bearer YOUR_TOKEN` header.
 *
 * Upgrade path (Phase 2, once you have employer accounts): replace this
 * with a Supabase auth role check (`profiles.role = 'admin'`) instead of a
 * shared secret. Swap this one function and every caller stays the same.
 */
export function isValidAdminToken(token: string | null | undefined): boolean {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  if (!expected) {
    // Fail closed — an unset secret should never mean "admin panel is open."
    return false;
  }
  return token === expected;
}
