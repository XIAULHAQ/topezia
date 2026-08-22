/**
 * The one place Topezia talks to Anthropic.
 *
 * Every model call used to be its own hand-rolled fetch — nine of them, no two
 * alike, none of them reading the `usage` block the API returns. The bill was
 * one number in the console with no way to say which feature it came from.
 * This module exists to make cost visible and controllable, per feature:
 *
 * 1. ATTRIBUTION. Every call names a `feature` (see LlmFeature). Each feature
 *    belongs to a BUCKET — widget / ingestion / member — and each bucket can
 *    carry its own API key (ANTHROPIC_API_KEY_WIDGET etc., falling back to
 *    ANTHROPIC_API_KEY). Separate keys make the console's own cost report
 *    split by bucket with zero further work.
 * 2. ACCOUNTING. The response's token usage, latency and outcome go to
 *    LlmUsage — one row per call, fire-and-forget (a lost row is fine; a
 *    slow insert must never delay a reply). /hq/ai-cost reads it.
 * 3. KILL SWITCHES. AI_DISABLED="widget,resume.tailor" turns off a bucket
 *    or a feature without a deploy. Callers already degrade gracefully when
 *    the key is missing (canned reply, rules-only extraction, provisional
 *    scores); a disabled feature reuses exactly that path via llmAvailable().
 * 4. FAILURES ARE NEVER FATAL to the product — but they ARE thrown from here,
 *    with the HTTP status attached, so a caller's existing catch keeps its
 *    behaviour and the failure is still recorded (an empty balance shows up
 *    as a wall of 400s on the cost page instead of a mystery — see the
 *    2026-08-16 incident).
 *
 * Deliberately raw fetch, not the SDK: that's what every call site used, it
 * keeps the bundle small on the edge-adjacent routes, and the two request
 * shapes we need (plain + streamed text) are a few dozen lines.
 */
import { prisma } from "@/lib/prisma";

export type LlmBucket = "widget" | "ingestion" | "member" | "ops";

export type LlmFeature =
  | "widget.answer"
  /** A widget reply served WITHOUT a model call (deterministic rule or cache).
   *  Recorded so the cost page can show what the model was spared. */
  | "widget.shortcut"
  | "widget.digest"
  | "widget.intake"
  | "widget.draft"
  | "ingest.extract"
  | "match.rerank"
  | "resume.parse"
  | "resume.parse_scanned"
  | "resume.assist"
  | "resume.tailor"
  | "posting.assist"
  | "seo.intro"
  | "script.canonicalize";

export const FEATURE_BUCKET: Record<LlmFeature, LlmBucket> = {
  "widget.answer": "widget",
  "widget.shortcut": "widget",
  "widget.digest": "widget",
  "widget.intake": "widget",
  "widget.draft": "widget",
  "ingest.extract": "ingestion",
  "match.rerank": "member",
  "resume.parse": "member",
  "resume.parse_scanned": "member",
  "resume.assist": "member",
  "resume.tailor": "member",
  "posting.assist": "member",
  "seo.intro": "ops",
  "script.canonicalize": "ops",
};

/** The default for everything; a call site that wants another says so. */
export const HAIKU = "claude-haiku-4-5-20251001";

/**
 * List price per million tokens, USD. Used to stamp an estimated cost on
 * each usage row at write time — so a later price change never rewrites
 * history, and the cost page needs no join. Unknown model → cost null, tokens
 * still recorded.
 */
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5-20251001": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-5": { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

export function estimateCostUsd(model: string, u: LlmUsageTokens): number | null {
  // No tokens, no cost — whatever the "model" was (rule:/cache: rows).
  if (!u.inputTokens && !u.outputTokens && !u.cacheReadTokens && !u.cacheWriteTokens) return 0;
  const p = PRICES[model];
  if (!p) return null;
  return (
    (u.inputTokens * p.in + u.outputTokens * p.out + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}

export type LlmUsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type LlmMessage = { role: "user" | "assistant"; content: string | unknown[] };

export type LlmRequest = {
  model?: string;
  system?: string;
  messages: LlmMessage[];
  max_tokens: number;
  temperature?: number;
  /** Who this call was for — lands on the usage row for per-site/per-member views. */
  siteId?: string | null;
  companyId?: string | null;
  profileId?: string | null;
};

export type LlmResult = {
  text: string;
  stopReason: string | null;
  usage: LlmUsageTokens;
  model: string;
};

export class LlmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Keys and switches
// ---------------------------------------------------------------------------

function keyFor(bucket: LlmBucket): string | undefined {
  const specific = process.env[`ANTHROPIC_API_KEY_${bucket.toUpperCase()}`];
  return specific || process.env.ANTHROPIC_API_KEY || undefined;
}

/**
 * AI_DISABLED is a comma-separated list of buckets and/or features:
 *   AI_DISABLED="widget"                 → every widget feature off
 *   AI_DISABLED="resume.tailor,ingestion" → one feature and one bucket off
 *   AI_DISABLED="all"                    → everything off
 * Read on every call so a Vercel env change takes effect on the next request.
 */
function disabled(feature: LlmFeature): boolean {
  const raw = process.env.AI_DISABLED;
  if (!raw) return false;
  const set = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return set.has("all") || set.has(feature) || set.has(FEATURE_BUCKET[feature]);
}

/**
 * Can this feature call the model right now? False when the bucket has no key
 * or the feature is switched off — the caller takes its no-model path either
 * way. Replaces the `if (!process.env.ANTHROPIC_API_KEY)` checks.
 */
export function llmAvailable(feature: LlmFeature): boolean {
  return !!keyFor(FEATURE_BUCKET[feature]) && !disabled(feature);
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

/** Usage inserts still in flight — scripts await flushLlmUsage() before exit. */
const pendingWrites = new Set<Promise<void>>();

/**
 * Wait for every usage row started so far to land. Request handlers never
 * need this (waitUntil covers them); a script that calls prisma.$disconnect()
 * at the end does, or the last few rows are lost with the connection.
 */
export async function flushLlmUsage(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}

type UsageRow = {
  feature: string; bucket: string; model: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  costUsd: number | null; latencyMs: number; ok: boolean; status: number | null; stream: boolean;
  siteId: string | null; companyId: string | null; profileId: string | null;
};

function usageRow(
  feature: LlmFeature, model: string, req: LlmRequest, usage: LlmUsageTokens,
  ok: boolean, status: number | null, latencyMs: number, stream: boolean, priceFactor: number
): UsageRow {
  return {
    feature,
    bucket: FEATURE_BUCKET[feature],
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd: ok ? scale(estimateCostUsd(model, usage), priceFactor) : 0,
    latencyMs,
    ok,
    status,
    stream,
    siteId: req.siteId ?? null,
    companyId: req.companyId ?? null,
    profileId: req.profileId ?? null,
  };
}

/**
 * Write usage rows without ever throwing into the caller, and without ever
 * starving the caller's own queries: ONE statement per call, however many
 * rows. On 2026-08-22 a batch of 194 results was recorded as 194 concurrent
 * inserts; they filled Prisma's pool (default 9 connections, 10 s wait) and
 * the ingestion's next query timed out and killed the run — after the batch
 * had been paid for. Rows that belong together go in together.
 *
 * On Vercel the write is handed to waitUntil (same pattern as
 * lib/errors/log.ts) so the function stays alive until it lands even after
 * the response has gone out; elsewhere it simply runs while the process
 * lives. A lost row costs nothing but a slightly low number on the report.
 */
function writeRows(rows: UsageRow[]): void {
  if (rows.length === 0) return;
  const insert = (rows.length === 1 ? prisma.llmUsage.create({ data: rows[0] }) : prisma.llmUsage.createMany({ data: rows }))
    .then(() => undefined)
    .catch((err: unknown) => {
      console.error(`[llm] ${rows.length} usage row(s) not written:`, err instanceof Error ? err.message : err);
    });
  pendingWrites.add(insert);
  void insert.finally(() => pendingWrites.delete(insert));
  try {
    if (process.env.VERCEL) {
      void import("@vercel/functions").then((m) => m.waitUntil(insert)).catch(() => {});
    }
  } catch {
    /* no platform hook — the promise still runs while the process lives */
  }
}

function record(
  feature: LlmFeature,
  model: string,
  req: LlmRequest,
  usage: LlmUsageTokens,
  ok: boolean,
  status: number | null,
  latencyMs: number,
  stream: boolean,
  /** 0.5 for Message Batches — half list price, same tokens. */
  priceFactor = 1
): void {
  writeRows([usageRow(feature, model, req, usage, ok, status, latencyMs, stream, priceFactor)]);
}


const scale = (n: number | null, f: number) => (n === null ? null : n * f);

const ZERO: LlmUsageTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * A reply that would have been a model call and wasn't — a deterministic rule
 * or a cache hit answered instead. Lands as a zero-token, zero-cost row whose
 * `model` names the mechanism ("rule:smalltalk", "cache:answer") so the cost
 * page can report the avoided share next to the paid calls. lib/llm-report.ts
 * keeps these out of the $ and $/call figures by that prefix.
 */
export function recordNoModel(
  feature: LlmFeature,
  how: `rule:${string}` | `cache:${string}`,
  attribution: { siteId?: string | null; companyId?: string | null; profileId?: string | null } = {},
  latencyMs = 0
): void {
  record(feature, how, { messages: [], max_tokens: 0, ...attribution }, ZERO, true, null, latencyMs, false);
}

function usageFrom(u: unknown, prev: LlmUsageTokens = ZERO): LlmUsageTokens {
  const o = (u ?? {}) as Record<string, unknown>;
  const n = (k: string, fallback: number) => (typeof o[k] === "number" ? (o[k] as number) : fallback);
  return {
    inputTokens: n("input_tokens", prev.inputTokens),
    outputTokens: n("output_tokens", prev.outputTokens),
    cacheReadTokens: n("cache_read_input_tokens", prev.cacheReadTokens),
    cacheWriteTokens: n("cache_creation_input_tokens", prev.cacheWriteTokens),
  };
}

function headers(key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
}

function params(req: LlmRequest, model: string, stream: boolean): Record<string, unknown> {
  return {
    model,
    max_tokens: req.max_tokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages,
    ...(stream ? { stream: true } : {}),
  };
}
const body = (req: LlmRequest, model: string, stream: boolean) => JSON.stringify(params(req, model, stream));

async function errorText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// The two calls
// ---------------------------------------------------------------------------

/**
 * One non-streaming call. Returns the concatenated text blocks. Throws
 * LlmError (with .status) on a non-2xx response, and a plain Error if the
 * feature is unavailable — callers keep their own catch/fallback.
 */
export async function llm(feature: LlmFeature, req: LlmRequest): Promise<LlmResult> {
  const bucket = FEATURE_BUCKET[feature];
  const key = keyFor(bucket);
  if (!key || disabled(feature)) throw new Error(`[llm] ${feature} unavailable (${!key ? "no key" : "disabled"})`);
  const model = req.model ?? HAIKU;
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: headers(key), body: body(req, model, false) });
  } catch (err) {
    record(feature, model, req, ZERO, false, null, Date.now() - t0, false);
    throw err;
  }
  if (!res.ok) {
    const detail = await errorText(res);
    record(feature, model, req, ZERO, false, res.status, Date.now() - t0, false);
    throw new LlmError(res.status, `Anthropic ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: unknown; model?: string };
  const usage = usageFrom(data.usage);
  record(feature, model, req, usage, true, res.status, Date.now() - t0, false);
  return {
    text: (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
    stopReason: data.stop_reason ?? null,
    usage,
    model: data.model ?? model,
  };
}

/**
 * Same call with stream: true. `onText` receives each text delta as it
 * arrives; the resolved value is the full text plus usage (input tokens come
 * on message_start, output tokens on the final message_delta).
 */
export async function llmStream(feature: LlmFeature, req: LlmRequest, onText: (delta: string) => void): Promise<LlmResult> {
  const bucket = FEATURE_BUCKET[feature];
  const key = keyFor(bucket);
  if (!key || disabled(feature)) throw new Error(`[llm] ${feature} unavailable (${!key ? "no key" : "disabled"})`);
  const model = req.model ?? HAIKU;
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: headers(key), body: body(req, model, true) });
  } catch (err) {
    record(feature, model, req, ZERO, false, null, Date.now() - t0, true);
    throw err;
  }
  if (!res.ok || !res.body) {
    const detail = res.ok ? "" : await errorText(res);
    record(feature, model, req, ZERO, false, res.status, Date.now() - t0, true);
    throw new LlmError(res.status, `Anthropic ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  let full = "";
  let usage: LlmUsageTokens = ZERO;
  let stopReason: string | null = null;
  let servedModel = model;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && typeof ev.delta.text === "string") {
            full += ev.delta.text;
            onText(ev.delta.text);
          } else if (ev.type === "message_start" && ev.message) {
            usage = usageFrom(ev.message.usage, usage);
            if (typeof ev.message.model === "string") servedModel = ev.message.model;
          } else if (ev.type === "message_delta") {
            usage = usageFrom(ev.usage, usage);
            if (typeof ev.delta?.stop_reason === "string") stopReason = ev.delta.stop_reason;
          }
        } catch {
          /* keep-alives and partial frames */
        }
      }
    }
  } finally {
    // Whatever arrived is billed whether or not the stream finished cleanly.
    record(feature, model, req, usage, true, res.status, Date.now() - t0, true);
  }
  return { text: full, stopReason, usage, model: servedModel };
}

// ---------------------------------------------------------------------------
// Message Batches — half price for work that can wait (strategy §3.4)
// ---------------------------------------------------------------------------

export type LlmBatchItem = { id: string; req: LlmRequest };
export type LlmBatchOutcome = {
  /** Completed requests, by the caller's id. */
  results: Map<string, LlmResult>;
  /** Requests the API answered with an error (message included). */
  errors: Map<string, string>;
  /** Requests still unfinished when waitMs ran out (batch cancelled) —
   *  the caller decides whether to run them synchronously or drop them. */
  unfinished: string[];
  batchIds: string[];
};

const BATCH_URL = "https://api.anthropic.com/v1/messages/batches";
/** The API allows 100k per batch; smaller batches finish sooner. */
const BATCH_CHUNK = 1000;

/**
 * Submit `items` as one or more Message Batches, poll until they end (or
 * `waitMs` elapses, default 25 min — then cancel and return what finished),
 * and return every result keyed by the caller's id. Each completed request
 * is recorded at half list price. Nothing here throws for a single bad
 * request; only submission failures and an unavailable feature do.
 *
 * Latency is minutes, not seconds — use it from scripts and crons only.
 */
export async function llmBatch(
  feature: LlmFeature,
  items: LlmBatchItem[],
  opts: { waitMs?: number; pollMs?: number; log?: (line: string) => void } = {}
): Promise<LlmBatchOutcome> {
  const bucket = FEATURE_BUCKET[feature];
  const key = keyFor(bucket);
  if (!key || disabled(feature)) throw new Error(`[llm] ${feature} unavailable (${!key ? "no key" : "disabled"})`);
  const out: LlmBatchOutcome = { results: new Map(), errors: new Map(), unfinished: [], batchIds: [] };
  if (items.length === 0) return out;

  const waitMs = opts.waitMs ?? 25 * 60 * 1000;
  const pollMs = opts.pollMs ?? 15_000;
  const log = opts.log ?? (() => {});
  const t0 = Date.now();

  // custom_id must be [A-Za-z0-9_-]{1,64}; ours are positional and mapped back.
  const byCustom = new Map<string, LlmBatchItem>();
  const chunks: LlmBatchItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_CHUNK) chunks.push(items.slice(i, i + BATCH_CHUNK));

  // Submit every chunk first so they process in parallel on Anthropic's side.
  const submitted: { batchId: string; customIds: string[] }[] = [];
  for (const [c, chunk] of chunks.entries()) {
    const requests = chunk.map((it, i) => {
      const custom = `c${c}_${i}`;
      byCustom.set(custom, it);
      return { custom_id: custom, params: params(it.req, it.req.model ?? HAIKU, false) };
    });
    const res = await fetch(BATCH_URL, { method: "POST", headers: headers(key), body: JSON.stringify({ requests }) });
    if (!res.ok) throw new LlmError(res.status, `Anthropic batch submit ${res.status}: ${await errorText(res)}`);
    const data = (await res.json()) as { id: string };
    submitted.push({ batchId: data.id, customIds: requests.map((r) => r.custom_id) });
    out.batchIds.push(data.id);
    log(`batch ${data.id}: ${requests.length} requests submitted`);
  }

  const status = async (batchId: string) => {
    const res = await fetch(`${BATCH_URL}/${batchId}`, { headers: headers(key) });
    if (!res.ok) throw new LlmError(res.status, `Anthropic batch status ${res.status}: ${await errorText(res)}`);
    return (await res.json()) as { processing_status: string; results_url: string | null; request_counts?: Record<string, number> };
  };

  // Poll. When time runs out, cancel what is left and give it a moment to
  // settle so the finished part of the batch can still be read.
  const pending = new Map(submitted.map((s) => [s.batchId, s]));
  let cancelled = false;
  while (pending.size > 0) {
    for (const [batchId] of [...pending]) {
      const st = await status(batchId);
      if (st.processing_status === "ended") {
        pending.delete(batchId);
        if (st.results_url) await readResults(st.results_url);
        const c = st.request_counts ?? {};
        log(`batch ${batchId}: ended (${c.succeeded ?? 0} ok, ${c.errored ?? 0} errored, ${c.expired ?? 0} expired, ${c.canceled ?? 0} canceled)`);
      }
    }
    if (pending.size === 0) break;
    if (!cancelled && Date.now() - t0 > waitMs) {
      cancelled = true;
      log(`batch wait of ${Math.round(waitMs / 60000)} min exceeded — cancelling ${pending.size} batch(es), keeping what finished`);
      for (const [batchId] of pending) {
        await fetch(`${BATCH_URL}/${batchId}/cancel`, { method: "POST", headers: headers(key) }).catch(() => {});
      }
    }
    // A cancelled batch ends within a minute or two; don't wait forever for it.
    if (cancelled && Date.now() - t0 > waitMs + 3 * 60 * 1000) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  async function readResults(url: string) {
    const res = await fetch(url, { headers: headers(key!) });
    if (!res.ok) throw new LlmError(res.status, `Anthropic batch results ${res.status}: ${await errorText(res)}`);
    const text = await res.text();
    const rows: UsageRow[] = []; // one statement for the whole batch — see writeRows
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row: { custom_id: string; result: { type: string; message?: { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: unknown; model?: string }; error?: { type?: string; message?: string } } };
      try { row = JSON.parse(line); } catch { continue; }
      const item = byCustom.get(row.custom_id);
      if (!item) continue;
      const model = item.req.model ?? HAIKU;
      if (row.result.type === "succeeded" && row.result.message) {
        const m = row.result.message;
        const usage = usageFrom(m.usage);
        rows.push(usageRow(feature, model, item.req, usage, true, 200, 0, false, 0.5));
        out.results.set(item.id, {
          text: (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
          stopReason: m.stop_reason ?? null,
          usage,
          model: m.model ?? model,
        });
      } else if (row.result.type === "errored") {
        rows.push(usageRow(feature, model, item.req, ZERO, false, null, 0, false, 1));
        out.errors.set(item.id, `${row.result.error?.type ?? "error"}: ${row.result.error?.message ?? ""}`.trim());
      }
      // expired / canceled fall through to `unfinished` below.
    }
    writeRows(rows);
  }

  for (const it of items) {
    if (!out.results.has(it.id) && !out.errors.has(it.id)) out.unfinished.push(it.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Token counting — free, for measuring a prompt diet before and after
// ---------------------------------------------------------------------------

/** Exact input-token count for a request, via /v1/messages/count_tokens.
 *  Not a model call: nothing is generated, nothing is billed, nothing is
 *  recorded. Throws when the feature's bucket has no key. */
export async function llmCountTokens(feature: LlmFeature, req: LlmRequest): Promise<number> {
  const key = keyFor(FEATURE_BUCKET[feature]);
  if (!key) throw new Error(`[llm] ${feature} unavailable (no key)`);
  const { max_tokens: _mt, ...rest } = params(req, req.model ?? HAIKU, false);
  void _mt;
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", { method: "POST", headers: headers(key), body: JSON.stringify(rest) });
  if (!res.ok) throw new LlmError(res.status, `Anthropic count_tokens ${res.status}: ${await errorText(res)}`);
  const data = (await res.json()) as { input_tokens: number };
  return data.input_tokens;
}
