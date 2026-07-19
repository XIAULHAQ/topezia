/**
 * Currency symbol for money display. Budgets are shown in the poster's REAL
 * currency (never FX-converted — the number must match what they'd see on the
 * source site). Unknown codes fall back to "CODE " prefix, e.g. "PLN 1,500".
 *
 * Deliberately a plain shared module (no "use client"): it's called from both
 * server components (job detail) and client pages (feed, projects) — a client
 * module's exports can't be invoked during server render.
 */
const CUR_SYMBOL: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", AUD: "A$", CAD: "C$",
  NZD: "NZ$", SGD: "S$", HKD: "HK$", JPY: "¥", CNY: "¥", MXN: "MX$",
};

export function curSym(code: string | null | undefined): string {
  if (!code) return "$";
  return CUR_SYMBOL[code] ?? `${code} `;
}
