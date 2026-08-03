/**
 * Which side of the product is this person here for?
 *
 * Topezia has two: a job hunt that starts with a resume, and a business area
 * that starts with a company. They share ONE account system, and that is
 * correct — an account is an email and a password, nothing more. A Company
 * hangs off it (Company.ownerUserId) exactly as a Profile does. NEITHER
 * REQUIRES THE OTHER: no route under /employer reads a Profile row, and
 * /api/company asks only "are you signed in".
 *
 * The router did not know that. "A new account with no resume goes to
 * /onboard" was written when every new account was a job seeker, and it
 * discarded `next` on the way. So somebody who installed the WordPress plugin,
 * pressed Connect, and created an account was handed a resume upload — and the
 * connection they were three seconds from finishing was left behind. That is
 * the whole of the "you must be a job seeker before you can be a business"
 * problem: two lines of routing, not a data model.
 *
 * Note there is no account TYPE here, on purpose. The same person may run a
 * shop and also look for work; one account should serve both, and it does. All
 * this decides is where a NEW account is sent first.
 */

/** Surfaces that belong to a company rather than a job hunt. */
export const BUSINESS_DESTINATIONS = ["/employer", "/connect/wordpress"] as const;

/** Where a business account lands when nothing more specific was asked for. */
export const BUSINESS_HOME = "/employer";

/**
 * `next` is a path, but it may carry a query string — the WordPress handshake
 * arrives as `/connect/wordpress?state=…` — so match on the path alone.
 */
export function isBusinessDestination(next: string | null | undefined): boolean {
  if (!next) return false;
  const path = next.split(/[?#]/)[0];
  return BUSINESS_DESTINATIONS.some((p) => path === p || path.startsWith(`${p}/`));
}
