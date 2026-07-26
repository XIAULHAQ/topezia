/**
 * In-process sliding-window rate limiter.
 *
 * Same honest limitation as the /hq login limiter (lib/hq-auth.ts): serverless
 * instances don't share memory, so this slows a casual abuser on one warm
 * instance rather than a distributed attacker. That is still worth having on
 * the endpoints that spend real money (LLM calls) or send email — it removes
 * the free unlimited-loop property without adding an infrastructure
 * dependency. If abuse ever shows up in the bills, the upgrade path is a
 * shared store (Upstash/Redis) behind this same function signature.
 */

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

/**
 * Record a hit and report whether `key` stays within `max` hits per
 * `windowMs`. Returns true when the call is ALLOWED.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow without bound on a long-lived
  // instance: every 10 minutes, drop keys with no recent hits.
  if (now - lastSweep > 10 * 60 * 1000) {
    lastSweep = now;
    for (const [k, hits] of buckets) {
      if (hits[hits.length - 1]! < now - windowMs) buckets.delete(k);
    }
  }

  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits); // keep the trimmed window, don't extend it
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Client IP for per-IP keys — Vercel sets x-forwarded-for; first hop is the client. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** The shared 429 body, so every limited endpoint says the same thing. */
export const RATE_LIMITED = { error: "Too many requests — please wait a bit and try again." };
