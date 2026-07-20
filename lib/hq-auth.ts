/**
 * Password gate for the internal dashboard (/hq).
 *
 * Replaces the old shared-token-in-the-URL scheme. Two things changed that
 * actually matter for security:
 *
 *  1. The secret is never stored in the browser. Signing in mints a SIGNED,
 *     EXPIRING session value (HMAC over the expiry) and stores that in an
 *     httpOnly cookie, so page scripts can't read it and a stolen cookie dies
 *     on its own. Previously the raw token sat in a JS-readable cookie.
 *  2. Comparisons are timing-safe and length-blind: both sides are HMAC'd to a
 *     fixed 32 bytes before comparing, so neither the value nor its length
 *     leaks through response timing.
 *
 * The password is ADMIN_PASSWORD, falling back to the existing
 * ADMIN_ACCESS_TOKEN so nothing breaks if only the old var is set. With
 * neither set the gate fails closed — an unset secret must never mean "open".
 *
 * Node crypto only, so callers must run on the Node runtime (route handlers
 * and server components do). Deliberately NOT used from middleware, which
 * runs on the edge and has no node:crypto.
 */
import crypto from "crypto";

export const HQ_COOKIE = "tz_hq";
const SESSION_SECONDS = 60 * 60 * 8; // 8h — a password session, not a month-long token

function secret(): string {
  return process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_TOKEN || "";
}

/** Fixed-length digest so comparisons never leak the secret's length. */
function digest(value: string, key: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Is a password gate even configured? Used to show a clear setup message. */
export function hqConfigured(): boolean {
  return secret().length > 0;
}

export function passwordMatches(input: string): boolean {
  const s = secret();
  if (!s) return false; // fail closed
  return equal(digest(input, "tz-hq-compare"), digest(s, "tz-hq-compare"));
}

/** `<expiryMs>.<hmac>` — self-verifying and self-expiring. */
export function mintSession(): { value: string; maxAge: number } {
  const exp = String(Date.now() + SESSION_SECONDS * 1000);
  return { value: `${exp}.${digest(exp, secret()).toString("hex")}`, maxAge: SESSION_SECONDS };
}

export function sessionValid(cookieValue: string | undefined | null): boolean {
  const s = secret();
  if (!cookieValue || !s) return false;
  const [exp, sig] = cookieValue.split(".");
  const expMs = Number(exp);
  if (!exp || !sig || !Number.isFinite(expMs) || Date.now() > expMs) return false;
  return equal(Buffer.from(sig, "hex"), digest(exp, s));
}

/**
 * Very small in-process attempt limiter for the login endpoint.
 *
 * Honest limitation: serverless instances don't share memory, so this slows a
 * casual guesser rather than a distributed one. The real protection is a long
 * random password; this just removes the free unlimited-guess property.
 */
const attempts = new Map<string, { n: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { n: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.n += 1;
  return rec.n > MAX_ATTEMPTS;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
