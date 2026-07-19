/**
 * Anonymous session id — a stopgap until job-seeker auth (Supabase Auth) is
 * built. A random uid is stored in an httpOnly cookie and used as
 * Profile.userId, so a visitor can parse a resume and get matches without
 * signing up. When real auth lands, migrate these profiles by userId.
 */
import { cookies } from "next/headers";

export const ANON_COOKIE = "topezia_uid";
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export function readAnonUid(): string | null {
  return cookies().get(ANON_COOKIE)?.value ?? null;
}
