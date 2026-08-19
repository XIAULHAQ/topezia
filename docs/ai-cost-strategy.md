# Topezia AI Cost Strategy

*Same features, less Anthropic spend. Written 2026-08-18 from a read of every call site in the codebase.*

## The short version

Every model call in Topezia is already on the cheapest tier (Haiku 4.5, $1 in / $5 out per million tokens). There is no cheaper Anthropic model to switch to, so the savings have to come from **calling the model less often, with less text, and never twice for the same work** — not from swapping models. Three things stand out:

1. **Nobody can see where the money goes.** There is no token accounting anywhere in the code, and one API key serves everything. The console total is the only number. Step one is attribution; without it every other change is a guess.
2. **The two volume drivers are the website chat widget and job ingestion.** Everything else (resume parsing, tailoring, drafting, digests) is metered per user action and already quota'd or premium-gated. Widget replies on the *free* plan (200/month/site, pooled per Studio account at 10,000) are model calls with no revenue behind them.
3. **Several calls are repeat work.** Repeated visitor FAQs, re-scoring the whole feed after someone fixes a typo in their name, re-parsing the same resume file. Caching by *what actually changed* removes those without touching the user experience.

Realistic outcome if the plan below is executed in order: **roughly 40–60% off the current bill with zero visible feature change**, more if the free-plan widget allowance is tightened (a product decision, flagged below, not made here).

---

## 1. Where the model is called today

All calls are raw `fetch` to `api.anthropic.com`, all Haiku 4.5, none use prompt caching, none use the Batch API, none record token usage.

| Call site | Trigger | Approx. per-call cost | Existing controls | Verdict |
|---|---|---|---|---|
| **Widget answer** `lib/widget/answer.ts` | Every visitor message on every connected site | ~6–8k tokens in, ~200 out → **≈ $0.008 / reply** | Monthly reply cap per plan (`lib/widget/caps.ts`: Free 200, Pro 2,000, Studio 10,000 pooled); IP limits 10/min, 60/hr — but `lib/rate-limit.ts` is an in-memory `Map`, so on Vercel it resets per instance and is soft | **#1 lever.** Highest volume, no answer reuse, largest prompt |
| **Job extraction** `lib/ingestion/llm-extract.ts` | Every *new unique* job description during ingestion (`scripts/run-ingestion.ts`, `lib/employer/enrich.ts`) | ~2k in, ~250 out → **≈ $0.004 / new job** | Cached by `descriptionHash` (identical text never pays twice); description capped at 4,000 chars | **#2 lever** if intake is in the tens of thousands/month. Batch-eligible (50% off) — nothing about it is interactive |
| **Feed rerank** `lib/matching/match.ts` | Feed/projects load when any of the top-12 lacks a cached score; also every job-detail view (`scoreOneJob`) | ~8k in, ~1k out → **≈ $0.013 / batch** | Cached in `MatchScore` per `matchVersion`; detail view 180/hr/user; **no rate limit on `/api/matches/rerank`** | Cache is invalidated by *any* profile edit, including full name, and wiped entirely on anon→signed-in merge — see §3.3 |
| **Resume tailor** `app/api/resume/tailor` | Per click | ≈ $0.013 | Premium-only; **no rate limit or quota** | Add a rate limit (e.g. 20/hr) — cheap insurance |
| **Resume parse** `lib/matching/parse-resume.ts` | Resume upload (anonymous, pre-signup by design) | text: ≈ $0.012; scanned PDF: **the whole file, up to 4 MB, as a document block** — the most expensive single call in the product (≈ $0.03–0.10+ depending on pages) | 10 uploads/hr/IP (in-memory) | No cache: re-uploading the same file re-parses |
| **Resume assist** `app/api/resume/assist` | Per click, drafting bullets/summary | ≈ $0.006–0.01 | 24-hour window quota (Free 1/30 days, Premium 3/week) | Fine |
| **Posting assist** `app/api/postings/assist` | Employer clicks "help me write" | ≈ $0.006 | 20/hr/user | Fine |
| **Inbox draft** `lib/widget/draft.ts` | Owner clicks Draft | ≈ $0.006 | — | Fine |
| **Lead brief** `lib/widget/intake.ts` | Once per captured lead | ≈ $0.003 | — | Fine |
| **Digest themes** `lib/widget/digest.ts` | Weekly cron, per site with ≥4 questions | ≈ $0.001 | — | Negligible |
| **SEO page intros** `lib/seo/intro.ts` | Script, cached in `PageIntro` | one-off | — | Negligible |
| **Skill canonicalisation** `scripts/canonicalize-skills.ts` | Manual script, Sonnet 5 | one-off | — | Negligible |

Embeddings (`lib/ingestion/embed.ts`) are Voyage, not Anthropic — out of scope, but note that every widget message also costs one Voyage embedding call.

**A note on prompt caching:** it looks like the obvious fix and it mostly isn't here. Haiku 4.5's minimum cacheable prefix is **4,096 tokens**; the widget system prompt is ~1.8k, the extraction prompt ~1.5k, the rerank prompt ~700, the parse prompt ~1.2k. Below the minimum the cache silently does nothing. Caching only pays for the rerank batch (if the profile block is placed first and the request exceeds 4k), so it is a minor item, not the headline.

---

## 2. Phase 0 — Make cost visible (1–2 days, no user-facing change)

**Status: shipped 2026-08-18** — `lib/llm.ts`, `LlmUsage` (migration 080), `/hq/ai-cost`, digest line, `AI_DISABLED`, per-bucket key support. Operational steps that remain for Brandon are in `docs/runbooks/ai-cost.md`. Do this first. Everything after it is measured against it.

**2.1 Split the API key by workload — zero code, same day.**
Create three keys in the Anthropic console: `widget`, `ingestion`, `member` (resume/tailor/assist/rerank/parse). Read them from `ANTHROPIC_API_KEY_WIDGET` etc. with fallback to `ANTHROPIC_API_KEY`. The console's cost report then shows the split per key. This alone answers "which of the three buckets is the bill".

**2.2 One `llm()` helper, one `LlmUsage` table.**
Replace the nine hand-rolled `fetch` blocks with a single `lib/llm.ts` that:
- takes `{ feature, model, system, messages, max_tokens, siteId?, profileId? }`,
- records `usage.input_tokens / output_tokens / cache_read_input_tokens` plus feature, siteId/companyId, profileId, and latency to a `LlmUsage` row (fire-and-forget insert; a lost row is fine),
- returns text + usage.

This is also the place to put the standing rule from the incident log — **LLM failures are never fatal** — once, instead of in nine try/catches.

**2.3 A cost page at `/hq/ai-cost`** (or a section on `/hq/errors`): spend by feature by day, top-20 sites by widget spend, cache-hit rate for extraction and rerank, replies-per-lead per site. Add a line to the Monday error digest: "AI spend last 7 days: $X (widget $a, ingestion $b, member $c)".

**2.4 Kill switches.** Per-feature env flags (`AI_DISABLED="widget"` or `"match.rerank"`, comma-separated, `"all"` for everything) so a runaway can be stopped without a deploy. Every feature already degrades gracefully when the key is missing; the flag just reuses that path.

**2.5 A monthly ceiling.** Console → Limits → set a hard monthly spend cap and an alert at 60%. It is the one control that works even if everything else regresses.

---

## 3. Phase 1 — Stop paying twice (1–2 weeks, no visible change)

Ordered by expected saving per hour of work.

### 3.1 Widget: answer without the model when the model would add nothing

**Status: shipped 2026-08-18** — `lib/widget/shortcut.ts` (small talk, contact-only, "talk to a person" run in the chat route *before* the monthly cap is spent; the taught near-exact rule runs in `answerFromSite` after retrieval, threshold `WIDGET_TAUGHT_EXACT_DISTANCE`, default 0.12 — lowered from 0.15 on 2026-08-19 after measuring a question vs its Spanish translation at 0.142). Each avoided call is recorded as a `widget.shortcut` row with `model = rule:<kind>` so `/hq/ai-cost` shows the share ("Widget replies without a model" tile). Tests: `npx tsx test/shortcut.test.ts`. Also fixed in passing: the widget's own opening greeting no longer rides in the retrieval embedding of the first question.

Insert a deterministic layer *before* the model call in `answerFromSite`. Each of these returns the same or better answer than Haiku would, at zero cost:

- **Owner-taught answer, near-exact match.** Retrieval already pulls `SiteFact` rows with distances. Rule 0 of the prompt says a taught answer is final anyway. When the best fact is within a tight distance (start at `< 0.15`, tune from logs), the conversation is one or two turns, and there's no order/contact context in play — return the fact's answer verbatim, `handoff:false`, sources empty. The owner wrote it; the model was only paraphrasing.
- **Small talk and closers.** "hi", "hello", "thanks", "ok", "bye", single emoji: canned reply per language (detect from the greeting itself). Today each costs a full retrieval + 6k-token model call.
- **Contact-details-only messages.** The route already detects and captures the lead *before* the model runs (rule 5c exists to stop the model asking again). When the message contained nothing but contact details, reply with the fixed "thanks, the team will follow up by email" sentence and skip the model.
- **"Talk to a person" / "human" / "call me" intents.** Regex + short phrase list → `handoff:true` with the fixed handoff copy. This is what the model does anyway.

Expected: 15–30% of widget messages never reach the model. Measure the share on `LlmUsage` once §2 lands.

### 3.2 Widget: reuse recent answers to the same question (semantic answer cache)

**Status: shipped 2026-08-19** — `lib/widget/answer-cache.ts` + `WidgetAnswerCache` (migration 081, applied). Lookup runs in `answerFromSite` right after the question embedding, before retrieval; first-turn only, no order/contact context, brand-scoped, 24h TTL, distance `WIDGET_ANSWER_CACHE_DISTANCE` (default 0.08). Answers that leaned on a product are only reused on the same page; the rest site-wide. Invalidated on recrawl and on any taught-fact write. Hits are `cache:answer` rows on `/hq/ai-cost`. Verified live against rodeo.graphics (paraphrase 0.031 hits; Ireland/Canada 0.275 misses).

The question is already embedded (for retrieval). Add a `WidgetAnswerCache` (siteId, question embedding, normalized pageUrl or null, reply, sources, products, expiresAt). On a first-turn question with no order/contact context: nearest cached entry for this brand within cosine distance `< 0.08` and younger than 24h → serve it, still counting it against the plan's reply cap (the customer still got an AI answer) but making no model call. Invalidate the site's cache on recrawl and on any `SiteFact` change.

Repeated FAQs ("opening hours", "do you ship to X", "how much is Y") are a large share of small-business chat traffic. Expected: another 15–30% of remaining calls, site-dependent. Streaming still works — stream the cached text in chunks so the UI is unchanged.

### 3.3 Rerank: invalidate on what the reranker actually reads

**Status: shipped 2026-08-19** — `lib/matching/match-version.ts`: `matchVersion` is now `h:<sha256>` of exactly the candidate block (`RERANK_PROMPT_VERSION` + headline role, seniority, years, skills name/tier/proficiency, industries, location, salary target/period, work authorization), recomputed at the end of both profile write paths. Insights cache re-keyed on `Profile.updatedAt` (any edit still refreshes it). Anon→account merge now re-keys scores (`adoptMatchScores`) instead of deleting them. `/api/matches/rerank` rate-limited 8/min/user. Job snippet 2,000 → 1,200 chars. Legacy UUID versions are replaced lazily on each profile's next save (one last full rerank each). Tests: `npx tsx test/match-version.test.ts`. **When editing `RERANK_PROMPT`, the model, or the snippet, bump `RERANK_PROMPT_VERSION`.**

`updateProfileFields` sets `matchVersion = randomUUID()` on **every** edit — full name, employment types, relocate toggle — and the whole top-12 gets re-scored (~$0.013) plus the insights cache evicts. The reranker only reads: headline, seniority, years, core/secondary skills, industries, location, salary target/period, work authorization.

Fix: compute `matchVersion` as a stable hash of exactly those fields (plus the prompt version) instead of a random UUID. Edits that don't change them keep the cache warm; reverting an edit hits the old rows again; a prompt change bumps everything by design. Same change makes `scoreOneJob` and the insights cache more stable for free.

Two smaller leaks in the same area: the anon→signed-in merge (`app/auth/callback/route.ts`, `app/api/auth/link/route.ts`) deletes the anonymous profile's `MatchScore` rows outright — re-key them to the surviving profile instead, since the person and the resume are the same; and `/api/matches/rerank` has no rate limit, so add one (a handful per minute per user is plenty — the cache absorbs legitimate reloads).

Also: `stripToSnippet(descriptionRaw, 2000)` per job → 1,200 chars is enough for a fit score (skills and seniority live in the first third of a posting). ~35% fewer input tokens per batch.

### 3.4 Extraction: send it through the Batch API, and less of it

**Status: shipped 2026-08-19** — `lib/llm.ts` gained `llmBatch()` (Message Batches: submit, poll, read results, record usage at half price; on timeout cancel and hand back the unfinished ids). `scripts/run-ingestion.ts` now runs in three phases: crawl+prepare every board → `extractMany()` (cache → rules-first → ONE batch for the rest → synchronous fallback for stragglers past `--batch-wait`, default 25 min) → write. `--sync` restores one call per posting. Rules-first is built (`lib/ingestion/rules-extract.ts`: title seniority marker + RoleAlias vertical + skill-dictionary ≥3, never for healthcare/trucking) but **OFF by default** (`INGEST_RULES_FIRST=1`): the eval (`scripts/eval-rules-extract.ts`, 200 model-labelled jobs) showed it fires on only 5% and its dictionary skills overlap the model's by 12% — the alias table is the model's raw output, not a curated vocabulary. Turn it on after curating the skill dictionary and re-running the eval (target ≥70% skill overlap). Every path is on the cost page: `cache:extract`, `rule:extract` rows at $0, batch rows at 0.5× list.

- **Batch API for ingestion.** `run-ingestion.ts` is a script, `enrich.ts` runs after an employer publishes — neither needs an answer in seconds. Batches are 50% off, all features supported, results within an hour (usually minutes). Collect the uncached jobs of a run, submit one batch, poll, write. Employer `enrich` can keep the synchronous path (it's a single job) — the volume is in the crawl.
- **Rules before model, more aggressively.** `normalize-rules.ts` already resolves title/salary/location/remote deterministically. Add a dictionary pass for skills (match posting text against the `Skill` taxonomy names + aliases) and a title→vertical map (the alias table already exists for roles). Send to the model only when *skills < 3 matched* or *vertical unresolved* or *the vertical needs Layout-B fields* (healthcare/trucking). Everything else is fully resolved by rules and never pays.
- **Cache key already good** (`descriptionHash`); confirm the hit rate on the cost page. If it is low, the same job on 5 boards is arriving with different boilerplate — normalise (strip "apply now" footers, EEO paragraphs, board chrome) *before* hashing so more duplicates collide.

Expected: 50% off the model portion from batching, plus whatever share the rules absorb (probably 30–50% of jobs once the skill dictionary is in).

### 3.5 Resume parse: cache by content hash

**Status: shipped 2026-08-19** — `lib/matching/parse-cache.ts` + `ResumeParseCache` (migration 082, applied): both parse paths are keyed by sha256(content + `PARSE_PROMPT_VERSION`), 30-day TTL, no file stored, hits are `cache:parse` rows. Scanned PDFs are trimmed to the first `RESUME_SCAN_MAX_PAGES` (default 3) with pdf-lib before going to the model; illegible scans (transcription < 100 chars) are never cached so a better copy re-parses. `/api/resume/tailor` rate-limited 20/hr/user (the §1 note). Verified live: 5-page PDF → 3, API accepts the trimmed document, second upload of the same file/text is a $0 cache hit. **Bump `PARSE_PROMPT_VERSION` when editing `PARSE_PROMPT`.**

Hash `resumeText` (or the PDF bytes for scanned uploads) and store the parse. Same file uploaded twice — very common when someone re-uploads to "refresh" — costs nothing the second time. For scanned PDFs, today the *entire* file goes to the model as a document block (up to 4 MB): split the PDF and send only the first 3 pages (a resume that long is an appendix; the structured fields are on pages 1–2), and reject/limit files above ~1.5 MB on the upload path. Since `/api/parse` is anonymous by design, move its 10/hr/IP limit to a durable store (same as the widget, §4) — it is the one unauthenticated endpoint that can be made to spend money.

### 3.6 Widget prompt diet (no behaviour change)

**Status: shipped 2026-08-19 — measured −30%** (`scripts/measure-widget-prompt.ts`, real retrieval on rodeo.graphics, 5 typical questions, exact counts from `count_tokens`: **5,188 → 3,650 avg input tokens**; system 1,248 → 918). What did it: (a) `tidy()` collapses the blank-line/indent runs crawled text is full of — no re-crawl, no information lost; (b) `selectExcerpts()` — retrieve 12, show ≤8, ≤2 per page, ≤1,500 chars each, ≤7,500 total (the distance cutoff in the original plan was dropped: measured distances are flat with no gap to cut on, while the same page took 3 of the 8 slots — so the cap is per page, not per distance); (c) history 6 × 600 chars, latest turn in full; (d) the ~200-token voice-buttons rule only when the last two visitor turns mention voice/audio/hear/etc.; (e) every rule reworded tighter, none removed, `ORDER_RULES` included. Behaviour spot-checked live (grounded answers, honest handoffs, voice rule fires correctly, product cards + one qualifying question). Tests: `npx tsx test/widget-prompt.test.ts`.

Per reply today: 8 excerpts × up to 1,800 chars, 6 products × 300, 8 history turns × up to 1,500 chars, and a ~1.8k-token rule block.
- Drop excerpts past a distance cutoff (log the distance of the excerpt the model actually cited — cited ones cluster tightly; the 7th and 8th are rarely used).
- Cap excerpts at 1,200 chars, history at 6 turns × 600 chars (older turns matter for continuity, not verbatim).
- The rules block has grown by accretion (4b/4c/5b/5c/5d…). A careful pass can take it to ~1.1k tokens without losing a rule — the voice-buttons paragraph alone is ~200 tokens and applies to a tiny fraction of chats; make it conditional on the visitor mentioning voice/audio/microphone/hear.

Expected: 30–40% fewer input tokens per reply that still reaches the model.

---

## 4. Phase 2 — Structural (product decisions, flagged for Brandon)

These change what free users get or how much a plan includes. They are the biggest single lever, which is why they need a decision rather than a quiet edit.

- **Free plan widget allowance.** 200 model replies/month/site is a real cost per free site with no revenue. Options, in order of gentleness: (a) keep 200 but serve the deterministic layer + answer cache first — most of the saving with no plan change; (b) drop to 50–100 model replies and let the rest of the month run "taught answers + best excerpt + message form" (still useful, no model); (c) make AI replies a Pro feature and give Free the message-capture widget only. Billing is live now (Free/Pro/Studio since 2026-08-02), so the earlier "no upsell until purchase flow exists" constraint no longer applies.
- **Studio's 10,000 pooled replies** at ~$0.008 each is up to $80/month of model cost inside one subscription. Fine if Studio is priced above that; worth checking it is.
- **Widget abuse.** The per-IP limits live in an in-memory map and reset per serverless instance; a scripted visitor can burn a free site's monthly 200 in minutes and a Studio pool in an hour. Move the chat rate limit to Postgres or Upstash (a `WidgetRateLimit` table with the same conditional-UPDATE trick `caps.ts` already uses works and needs no new vendor), and add a per-visitor-session cap (e.g. 40 messages/day) on top of per-IP.
- **Extraction volume itself.** If the ingestion bucket turns out to be the largest, the cheapest job is the one never ingested: tighten source selection (dead boards, verticals with zero roles — see the role taxonomy note) before optimising the model call.

---

## 5. What I would *not* do

- **Switch providers or self-host a small model.** "Less dependency on Anthropic" is a fair goal, but Haiku 4.5 is already priced at the bottom of the hosted market, the prompts have been tuned against it (the widget's grounding rules, the extraction verticals, the reranker's honesty), and every one of the incidents in the error log came from *availability* (empty balance) not price. Re-qualifying nine prompts on a different model to save a fraction of a bill that Phase 1 halves is a bad trade. If one workload ever justifies it, it's extraction — batchable, offline-evaluable against the existing cache as ground truth — and only after Phase 0 shows it is the dominant cost.
- **Add prompt caching everywhere.** See §1 — below Haiku's 4,096-token minimum it does nothing, and restructuring prompts to clear the bar would *add* tokens.
- **Downgrade quality to save tokens** (shorter answers, fewer excerpts than the question needs, dropping the rerank). The plan above cuts *waste*; every change is invisible to the person on the other end.

---

## 6. Order of work

| Step | Effort | Visible to users | Expected effect |
|---|---|---|---|
| 2.1 Split API keys | 1 hour | No | Attribution today |
| 2.5 Console spend cap + alert | 10 min | No | Safety |
| 2.2–2.4 `lib/llm.ts` + `LlmUsage` + `/hq/ai-cost` + kill switches | 1–2 days | No | Everything below becomes measurable |
| 3.1 Widget deterministic layer | 1 day | No (better latency) | −15–30% widget calls |
| 3.3 Rerank invalidation by content hash + shorter snippets | ½ day | No | Most rerank spend, if profile edits are frequent |
| 3.6 Widget prompt diet | 1 day | No | −30–40% tokens/reply |
| 3.2 Widget semantic answer cache | 1–2 days | No | −15–30% remaining widget calls |
| 3.4 Extraction: Batch API + rules-first + hash normalisation | 2–3 days | No | −50–75% ingestion model spend |
| 3.5 Resume parse cache | ½ day | No | Small, cheap to do |
| §4 Plan/abuse decisions | decision + 1–2 days | Yes | Largest single lever; Brandon's call |

Re-read the cost page after each step; stop when the marginal step costs more engineering than it saves. If Phase 0 shows one bucket is 80% of the bill, do that bucket's Phase 1 items first and skip the rest until they matter.
