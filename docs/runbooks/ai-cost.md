# AI cost — how it's tracked and controlled

Companion to `docs/ai-cost-strategy.md` (Phase 0, shipped 2026-08-18).

## What exists

- **`lib/llm.ts`** — the only place the app calls Anthropic. Every call names a
  feature (`widget.answer`, `ingest.extract`, `match.rerank`, `resume.parse`,
  `resume.parse_scanned`, `resume.assist`, `resume.tailor`, `posting.assist`,
  `widget.digest`, `widget.intake`, `widget.draft`, `seo.intro`,
  `script.canonicalize`) and each feature belongs to a bucket:
  `widget` · `ingestion` · `member` · `ops`.
- **`LlmUsage`** table (migration 080, applied) — one row per call: tokens,
  estimated cost at list price, latency, ok/status, feature, bucket, and the
  site/company/profile it was for. Written fire-and-forget via `waitUntil`.
- **`/hq/ai-cost`** — total, per-bucket tiles, daily bars, per-feature table
  (cost, share, $/call, tokens, latency, failures), top-20 sites by widget
  spend with plan, and failure counts by HTTP status. 7 / 30 / 90 days.
- **Monday error digest** now ends with one line: AI spend last 7 days, split
  by bucket, plus failed-call count.

## Environment variables (Vercel)

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Fallback key for every bucket (what exists today). |
| `ANTHROPIC_API_KEY_WIDGET` / `_INGESTION` / `_MEMBER` / `_OPS` | Optional per-bucket keys. Create them in the Anthropic console (Settings → API keys, one per bucket, named the same) and the console's own usage report splits by bucket with no further work. |
| `WIDGET_TAUGHT_EXACT_DISTANCE` | Phase 1 §3.1: below this cosine distance the nearest owner-taught answer is served verbatim, no model. Default `0.12` (a question and its translation measure ~0.14 — going above that risks an English taught answer for a Spanish visitor). Tighten if owners report a taught answer showing up for the wrong question. |
| `WIDGET_ANSWER_CACHE_DISTANCE` | Phase 1 §3.2: below this distance a first-turn question reuses the last 24h's answer to the same question (`cache:answer` rows). Default `0.08`; measured 2026-08-19: paraphrases 0.03–0.05, "ship to Ireland" vs "ship to Canada" 0.28. To bypass the cache without a deploy set it to `0.0001`. Invalidated on recrawl and on any taught-fact write. |
| `RESUME_SCAN_MAX_PAGES` | §3.5: pages of a scanned PDF sent to the vision parse. Default `3`. Raise only if real resumes are losing content (check the parse, not the cost). |
| `AI_DISABLED` | Kill switch. Comma-separated buckets and/or features: `widget`, `resume.tailor,ingestion`, or `all`. Takes effect on the next request — no redeploy. Every feature falls back to its no-model path (canned reply, provisional match score, "not available right now" 503, rules-only ingestion). |

## When the ingest workflow FAILS (not times out)

`main()` exits 1 on any uncaught error. Read the step timing on the Actions
run and the `LlmUsage` rows for that window before the log:

- Batch rows present (`$/call ≈ 0.0011`), then death within ~10 s, 0 jobs
  created = something threw right after the batch. 2026-08-22: 194 results
  were recorded as 194 concurrent inserts, Prisma's pool (9 connections,
  10 s wait on the runner) timed out, and an un-wrapped `source.update`
  killed the run. Fixed: usage rows go in ONE `createMany` per batch, and
  every piece of bookkeeping in the script is non-fatal. The paid batch
  results are lost (they are not persisted); the next scheduled run redoes
  them — cost of one batch, nothing else.
- No batch rows at all = it died in phase A (crawl) — a board's API, or the DB.

## Reading the page

- **`widget.answer` avg input tokens creeping up** = someone edited the
  prompt or the excerpt budget. `npx tsx scripts/measure-widget-prompt.ts`
  gives the exact number for 5 typical questions (3,650 after §3.6 on
  2026-08-19; 5,188 before). Run it before and after any prompt edit.

- **"Widget replies without a model" tile** = Phase 1 at work: the count and
  share of widget replies answered by a rule (`smalltalk`, `contact`, `human`,
  `taught`) or served from the 24h answer cache (`answer`) instead of Haiku. These rows sit in `LlmUsage` with
  `model = rule:<kind>` and cost 0; the $ figures exclude them. If the share is
  ~0 after a week, either traffic is all substantive questions (fine) or a
  rule is not firing — check `test/shortcut.test.ts` against real
  `WidgetQuestion` rows.

- **A wall of `400` failures with $0 spend** = the Anthropic balance is empty
  (this was the state on 2026-08-18 when Phase 0 shipped — top up before
  expecting any spend to appear). Same diagnosis as the 2026-08-16 incident.
- **`widget` bucket dominating, with FREE-plan sites at the top of the site
  table** = the free-allowance question in strategy §4.
- **`ingest.extract` dominating** = since §3.4 shipped the twice-daily crawl
  extracts through one Message Batch at half price, after the hash cache and
  the rules-first pass (`cache:extract` / `rule:extract` rows in the tile).
  If `$/call` on `ingest.extract` is at full Haiku price, the batch fell back
  to synchronous calls — read the Actions log for "batch wait ... exceeded"
  or "batch failed", and consider a longer `--batch-wait`. `--sync` on the
  workflow_dispatch is the escape hatch. Rules-first agreement with the model
  is measured by `npx tsx scripts/eval-rules-extract.ts`.
- **`match.rerank` high with few members** = since §3.3 shipped, edits to
  non-rerank fields no longer evict scores, so look for: a bumped
  `RERANK_PROMPT_VERSION` (everyone re-scores once — expected), many *new*
  members, or a loop hitting `/api/matches/rerank` (now 8/min/user, check
  429s). Legacy profiles re-score once on their first save after 2026-08-19.

Costs are estimates (list price × tokens, stamped at write time). The
Anthropic console is the invoice; this page is the breakdown.

## Two things only Brandon can do

1. **Console spend limit + alert** — Anthropic console → Settings → Limits:
   set a monthly cap and an email alert at ~60 %. The one control that works
   even if everything in the app regresses.
2. **Create the per-bucket keys** (optional but recommended) and paste them
   into Vercel. Until then everything runs on `ANTHROPIC_API_KEY`, and the
   in-app page is the only breakdown.

## Adding a new model call

Never `fetch` Anthropic directly. Add the feature name to `LlmFeature` and
`FEATURE_BUCKET` in `lib/llm.ts`, then call `llm(feature, {...})` or
`llmStream(...)`. Guard with `llmAvailable(feature)` and keep the caller's
no-model fallback — that is what the kill switch relies on.
