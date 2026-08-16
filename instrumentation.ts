/**
 * Server boot hook (Next.js instrumentation). Runs once per server process.
 *
 * Its one job: route server-side console.error into the error log
 * (lib/errors/log.ts). Every API route already says `console.error(...)` in
 * its catch blocks, and Next itself logs uncaught route/page errors the same
 * way — so hooking the one function captures all of it without touching a
 * hundred files. Console output is UNCHANGED: Vercel's log stream still gets
 * every line; the log just also gets a grouped, persistent copy.
 *
 * Node runtime only. The edge runtime has no Prisma, and `experimental.
 * instrumentationHook` in next.config.js is what makes this file load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError, describeError, errorLogBusy } = await import("@/lib/errors/log");

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      // Anything the log's own write emits must not come back in here.
      if (errorLogBusy()) return;
      const err = args.find((a) => a instanceof Error);
      const text = args
        .filter((a) => !(a instanceof Error))
        .map((a) => (typeof a === "string" ? a : safeString(a)))
        .join(" ")
        .trim();
      const described = err ? describeError(err) : { message: text, stack: null };
      const message = err && text ? `${text} ${described.message}` : described.message || text;
      if (!message) return;
      // The [tag] convention many routes use ("[cron/widget-digest] …")
      // doubles as the path when there is no request context to ask.
      const tag = /^\[([^\]]+)\]/.exec(message)?.[1] ?? null;
      logError({ source: "server", message, stack: described.stack, path: tag });
    } catch {
      /* never let logging break logging */
    }
  };
}

function safeString(v: unknown): string {
  try {
    return typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v);
  } catch {
    return String(v);
  }
}
