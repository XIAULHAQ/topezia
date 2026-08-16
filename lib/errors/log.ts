/**
 * The error log — one place every failure lands, so it can be reviewed
 * weekly, fixed, and cleared. Storage is the ErrorLog table (migration 077),
 * read at /hq/errors and by the Monday digest.
 *
 * Three writers feed this:
 *   1. instrumentation.ts hooks server-side console.error, so every existing
 *      `console.error(...)` in an API route or server component is captured
 *      without touching it — and so are Next's own uncaught-route-error logs.
 *   2. /api/errors receives client-side crashes (window "error" and
 *      "unhandledrejection", plus the app/error.tsx boundary).
 *   3. explicit logError() calls, for the places that swallow an error on
 *      purpose but still want it seen.
 *
 * Rules this file keeps, because a logger that breaks the thing it is logging
 * is worse than none:
 *   - NEVER throws, never awaits anything the caller waits on. Fire and forget.
 *   - Re-entrancy guarded: if writing the log itself errors (DB down), that
 *     error is NOT logged through this path — it would recurse forever.
 *   - Throttled per fingerprint in memory: a hot loop logging the same error
 *     10,000 times a minute becomes ~1 write a minute. The COUNT is still
 *     accurate to what we saw in this process, batched into that write.
 *   - Grouped by fingerprint (source + normalised message + path). Numbers,
 *     ids and quoted strings are stripped from the message before hashing so
 *     "user 123 not found" and "user 456 not found" are one bug, not two.
 */
// No Node imports here on purpose: Next compiles instrumentation.ts (which
// pulls this in) for the edge runtime too, where "crypto" doesn't resolve.
// A 64-bit FNV-1a in plain JS is plenty for grouping.

export type ErrorSource = "server" | "client" | "api";

export type LogErrorInput = {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  path?: string | null;
  meta?: Record<string, unknown> | null;
};

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_PATH = 300;

/** Per-fingerprint: pending count and when we last wrote. */
const pending = new Map<string, { count: number; lastWrite: number; input: LogErrorInput; timer?: ReturnType<typeof setTimeout> }>();
const WRITE_EVERY_MS = 60_000;
/** Cap the map so a fingerprint-flooding attacker can't grow it forever. */
const MAX_TRACKED = 500;

let writing = false;
/** True while a log write is in flight — the console hook uses this to
 *  ignore anything logged by the write itself. */
export function errorLogBusy(): boolean { return writing; }

/** Strip the parts of a message that vary per occurrence but not per bug. */
export function normaliseMessage(msg: string): string {
  return stripAnsi(msg)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/(["'`]).*?\1/g, "$1…$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function fingerprintOf(source: string, message: string, path: string | null | undefined): string {
  return fnv1a64(`${source}\n${normaliseMessage(message)}\n${path ?? ""}`);
}

function fnv1a64(str: string): string {
  // Two independent 32-bit FNV-1a passes (different seeds) joined — 64 bits
  // of grouping key without BigInt, which the ES2017 target doesn't allow.
  const pass = (seed: number, salt: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= (str.charCodeAt(i) + salt) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return pass(0x811c9dc5, 0) + pass(0x811c9dc5 ^ 0x5bd1e995, 7);
}

/** Terminal colour codes — Next's dev logger wraps errors in them. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Turn whatever was thrown / logged into a message + stack pair. */
export function describeError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) return { message: err.message || err.name || "Error", stack: err.stack ?? null };
  if (typeof err === "string") return { message: err, stack: null };
  try {
    return { message: JSON.stringify(err).slice(0, MAX_MESSAGE), stack: null };
  } catch {
    return { message: String(err), stack: null };
  }
}

/**
 * Record an error. Safe to call from anywhere on the server; returns
 * immediately. Nothing about the caller's control flow depends on it.
 */
export function logError(input: LogErrorInput): void {
  try {
    const message = stripAnsi(input.message || "Unknown error").slice(0, MAX_MESSAGE);
    const path = input.path ? input.path.slice(0, MAX_PATH) : null;
    const fp = fingerprintOf(input.source, message, path);
    const now = Date.now();
    const entry = pending.get(fp);
    if (entry) {
      entry.count += 1;
      entry.input = { ...input, message, path, stack: input.stack?.slice(0, MAX_STACK) ?? null };
      if (now - entry.lastWrite < WRITE_EVERY_MS) {
        // Batched into the next write — scheduled once, so a burst that then
        // stops still gets its full count recorded.
        if (!entry.timer) {
          entry.timer = setTimeout(() => { entry.timer = undefined; void flush(fp); }, WRITE_EVERY_MS - (now - entry.lastWrite));
          // Never keep a serverless instance alive just for this.
          (entry.timer as { unref?: () => void }).unref?.();
        }
        return;
      }
    } else {
      if (pending.size >= MAX_TRACKED) return;
      pending.set(fp, { count: 1, lastWrite: 0, input: { ...input, message, path, stack: input.stack?.slice(0, MAX_STACK) ?? null } });
    }
    void flush(fp);
  } catch {
    /* never */
  }
}

async function flush(fp: string): Promise<void> {
  const entry = pending.get(fp);
  if (!entry || entry.count === 0) return;
  // One write at a time: the guard is what stops a DB error inside THIS write
  // (which the console hook would hand straight back to us) from recursing.
  // Anything that arrives meanwhile waits its turn instead of being dropped.
  if (writing) { setTimeout(() => void flush(fp), 500); return; }
  const { count, input } = entry;
  entry.count = 0;
  entry.lastWrite = Date.now();
  writing = true;
  try {
    // Lazy import: instrumentation.ts loads this file at boot, before the
    // Prisma client is wanted, and a client component must never bundle it.
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ErrorLog" ("id","fingerprint","source","message","stack","path","meta","count","status","firstSeenAt","lastSeenAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::jsonb, $7, 'OPEN', $8, $8)
       ON CONFLICT ("fingerprint") DO UPDATE SET
         "count"      = "ErrorLog"."count" + EXCLUDED."count",
         "lastSeenAt" = EXCLUDED."lastSeenAt",
         "message"    = EXCLUDED."message",
         "stack"      = COALESCE(EXCLUDED."stack", "ErrorLog"."stack"),
         "meta"       = COALESCE(EXCLUDED."meta", "ErrorLog"."meta"),
         -- A resolved error that fires again is a REGRESSION: reopen it and
         -- keep the note so the reviewer sees what was tried last time.
         "status"     = 'OPEN',
         "resolvedAt" = NULL`,
      fp,
      input.source,
      input.message,
      input.stack ?? null,
      input.path ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
      count,
      now
    );
  } catch {
    // The log is unavailable. Put the count back so it isn't lost if the DB
    // comes back, and say so ONCE on stderr without going through ourselves.
    entry.count += count;
    if (!(globalThis as { __tzErrLogWarned?: boolean }).__tzErrLogWarned) {
      (globalThis as { __tzErrLogWarned?: boolean }).__tzErrLogWarned = true;
      process.stderr.write("[error-log] could not write to ErrorLog — is migration 077 applied?\n");
    }
  } finally {
    writing = false;
  }
}

/** Convenience for catch blocks: logError from a thrown value. */
export function logCaught(err: unknown, ctx: { source?: ErrorSource; path?: string | null; meta?: Record<string, unknown> } = {}): void {
  const { message, stack } = describeError(err);
  logError({ source: ctx.source ?? "server", message, stack, path: ctx.path ?? null, meta: ctx.meta ?? null });
}
