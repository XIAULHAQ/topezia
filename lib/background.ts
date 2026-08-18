/**
 * Let a promise finish after the response has gone out.
 *
 * On Vercel a function may be frozen the moment its response closes, so any
 * write started "after the send" — a usage row, a cache fill — is handed to
 * waitUntil to keep the instance alive until it lands. Anywhere else the
 * promise simply runs while the process lives. Never throws into the caller;
 * the promise's own rejection is the callee's to catch.
 */
export function inBackground(p: Promise<unknown>): void {
  const settled = p.then(() => undefined, () => undefined);
  try {
    if (process.env.VERCEL) {
      void import("@vercel/functions").then((m) => m.waitUntil(settled)).catch(() => {});
    }
  } catch {
    /* no platform hook — it still runs while the process lives */
  }
}
