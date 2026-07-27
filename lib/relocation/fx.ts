/**
 * Free, unauthenticated FX rates from open.er-api.com — verified live while
 * planning this feature to cover PKR/AED/SAR/INR, which the ECB-backed
 * alternative (Frankfurter) does not carry at all. No API key, so nothing to
 * gate on env vars for.
 *
 * Cached in-process per base currency, same dedupe-by-key pattern as
 * lib/matching/insights.ts's insightsCache: concurrent requests for the same
 * base share one in-flight fetch. Rates update daily, so a 24h TTL is never
 * stale in a way that matters here.
 */
const FX_TTL_MS = 24 * 60 * 60 * 1000;
const rateCache = new Map<string, { at: number; p: Promise<Record<string, number> | null> }>();

async function fetchRates(base: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result !== "success" || !data.rates) return null;
    return data.rates as Record<string, number>;
  } catch {
    // A failed rate fetch just means the salary block is omitted from the
    // card — this must never be a blocking error for the job page.
    return null;
  }
}

function getRates(base: string): Promise<Record<string, number> | null> {
  const now = Date.now();
  const hit = rateCache.get(base);
  if (hit && now - hit.at < FX_TTL_MS) return hit.p;
  const p = fetchRates(base).then((rates) => {
    // Don't let a transient outage poison the cache for the full TTL — only
    // a genuine rate set is worth remembering for a day.
    if (rates == null) rateCache.delete(base);
    return rates;
  });
  rateCache.set(base, { at: now, p });
  return p;
}

/** Convert an amount in `from` currency to `to` currency; null if either leg is unavailable. */
export async function convert(amount: number, from: string, to: string): Promise<number | null> {
  if (from === to) return amount;
  const rates = await getRates(from);
  const rate = rates?.[to];
  if (rate == null) return null;
  return amount * rate;
}
