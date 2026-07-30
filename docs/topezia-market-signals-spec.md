# Topezia — Market Signal Cards Spec

> **Status:** New feature spec, additive to the feed. Not a replacement for any existing slice.
> **Revised 2026-07-30** after testing the original v1 against the live database. The concept and guardrails are unchanged; the *metrics* changed from deltas to levels, because deltas are not honestly computable yet. See §0.
> **Origin:** Replaces the "third-party news snippet" idea. Rejected that approach for licensing risk (republishing AP/Reuters-sourced content without full attribution/outbound links) and low differentiation. This spec uses Topezia's own ingested data instead — legally clean, on-brand with the honesty-through-data positioning, and reuses the ingestion pipeline with no new external dependency.

---

## 0. What changed in the 2026-07-30 revision, and why

The first draft specced four **delta** signals ("up 18% this month"). Measured against the live database, every one of them would have shipped a confidently wrong number:

- **Survivorship bias.** We hold *live* postings; boards remove filled roles. So the 0–30d cohort is systematically fuller than the 30–60d one, and `posting_volume_change` reads "up" for every scope, always: account-executive 460 vs 62, backend-engineer 274 vs 64, engineering-manager 172 vs 49. That is board attrition, not a market move.
- **Index age.** Oldest `firstSeenAt` is 2026-07-16 — the index is 14 days old, so a `90d` window has nothing to compare against.
- **Our own seeding looks like market activity.** 98 of 128 companies had a first listing in the last 7 days because we added boards, not because employers entered the market.

The original `≥10 listings in both windows` rule did not catch any of this, and could not have: it is a **magnitude** check, and these are **bias** failures — large samples, high confidence, systematically wrong. That distinction is now a shipping requirement (§4a).

Three fixes, all adopted:

1. **`postedAt`, never `firstSeenAt`,** for anything time-scoped. `firstSeenAt` records when *we crawled* a posting, so adding one big board renders as a market surge. `postedAt` is present on **100%** of live jobs.
2. **Levels, not deltas, for v1.** "61% of backend roles are remote, based on 274 postings" is true today and carries no survivorship risk. The delta version becomes correct later with no schema change — expiry *marks* rows (`SUSPECTED_DEAD` → `EXPIRED`) rather than deleting them, so the history accrues on its own. Nothing to build for that; only time.
3. **Read from `page_stats`, don't recompute.** See §2.

---

## 1. Concept

A **Market Signal** is a short, data-backed observation about a user's field, computed entirely from listings already in the database. It renders as a feed card interleaved with job cards — same visual rhythm as job cards, distinct enough to signal "this is insight, not a listing."

Examples of the sentence shapes to generate (not literal copy — see §3 for exact templates):

- "142 travel nurse postings are open in Texas right now."
- "38 companies are hiring frontend developers right now."
- "Median rate for graphic designers is $45/hr, most between $38 and $52."
- "61% of backend roles are remote."

Each carries its sample ("based on N postings"), which is the whole trust mechanism.

The v1 shapes are **levels** — statements about the market as it stands. The delta shapes the first draft used ("up 18% this month", "moved from $42 to $45") are deferred to v2 and listed in §3a; §0 explains why they would have been wrong today.

All numbers trace directly to a query Claude Code can point to — no LLM-generated numbers, ever. If an LLM is used at all (optional, see §5), it only rephrases a pre-computed fact, it never invents or estimates one.

---

## 2. Data model — v1 adds NO new table

The original draft specced a `market_signals` table. Following its own instruction not to duplicate the `page_stats` computation to its conclusion: **every v1 level signal is a column `page_stats` already has to hold** (SEO addendum §2.1 — listing count, median/p25/p75 pay, pay sample size, top skills, employment-type breakdown, remote share, `computed_at`, all scoped by role/location).

So v1 is a **read layer**, not a second aggregation. This is not a scope cut — it is the only way to guarantee the feed card and the SEO page never show two different numbers for the same fact, which §3 already demanded and which a parallel query would eventually violate.

A `MarketSignal` table earns its place when **deltas** arrive, because a delta needs a stored prior observation that `page_stats` (a current-state snapshot) does not keep. Defer the table until then, and add it with real history behind it.

Corrections to the original DDL, for whenever that table is written:

- **There is no `locations` table.** `Job` carries `locationState` (US state code, US-only concept) and `country` (ISO-3166 alpha-2, nullable — `null` means genuinely unknown, never assume US). Scope by those columns, not a foreign key that has nothing to point at.
- **Table and column casing is PascalCase, quoted** (`"Job"`, `"Role"`, `"Vertical"`) — this is a Prisma-managed schema, so the model goes in `prisma/schema.prisma` and the migration is hand-written SQL applied per `docs/runbooks/prisma-baseline.md`, never `migrate dev` against production.
- **`baseSalary` is a JSON-LD field name, not a column.** The columns are `salaryMin`, `salaryMax`, `salaryPeriod` (`HOUR`/`YEAR`/…) and `salaryCurrency`.

---

## 3. Signal types (v1 — ship these four levels, nothing else)

Keep the list small. A feed with 12 signal types feels like noise; 4 feels like insight.

Every one of these is a **level**: a statement about the market as it stands, with the sample it rests on. None compares two time windows, so none can be distorted by survivorship or by when we started collecting.

| `signal_type` | Template | Source column in `page_stats` |
|---|---|---|
| `open_volume` | "{n} {role} postings are open in {location} right now" | `listing_count` |
| `employer_breadth` | "{n} companies are hiring {role} right now" | distinct employer count in scope |
| `pay_level` | "Median {role} pay is ${median}/{unit}, most between ${p25} and ${p75}" | `median_pay`, `p25_pay`, `p75_pay`, `pay_type`, `pay_sample_size` |
| `remote_level` | "{pct}% of {role} postings are remote" | `remote_share` |

Rules:

- **Minimum sample size to generate a signal at all: 10 listings in scope.** Below that, don't generate it.
- **`pay_level` uses the SEO addendum's threshold, not this one: ≥ 5 listings *with extracted pay*.** The two documents must agree, because the feed card and the SEO page render the same number from the same row — and where they disagree, the addendum wins, since it owns `page_stats`. (An earlier revision of this file claimed the addendum's bar was 10. It is 5; the claim was wrong.)
- **Always render the sample.** Every card carries "based on N postings" (§6). A level without its denominator is a claim, not a fact.
- Round all displayed numbers the same way as `page_stats` in the SEO addendum. Since v1 reads the same row, this is automatic rather than a discipline to maintain.
- **Pay is USD-only today** (measured: 2,150 live jobs carry a range, all USD, split HOUR 53 / YEAR 2,097). Split by pay type as the SEO addendum requires; when a second currency appears, `pay_level` must scope by currency or omit rather than mixing.

### 3a. Deferred to v2 — the delta signals

Held back, not abandoned. Each becomes correct once there is real posting history:

| `signal_type` | Blocked on |
|---|---|
| `posting_volume_change` | Retained `EXPIRED` rows spanning both windows, so the comparison isn't survivorship. Cohort by `postedAt`, count **all statuses**, never LIVE-only. |
| `rate_shift` | Same, plus pay coverage above 15.9% so the per-window sample clears the bar. |
| `remote_share_shift` | Same window history. |
| `new_employer_activity` | A way to distinguish "employer newly entered the market" from "we newly added their board". Until then it measures our own ingestion. |

---

## 4. Confidence & tone guardrails

Same principle as the match-score framing from earlier: **describe the market, never judge the user or the employer.**

- `confidence: 'high'` = sample size ≥ 25 in scope (≥ 25 in *both* windows, once delta signals exist). `'low'` = 10–24. Only render `'high'` signals by default; `'low'` signals are a fallback if a scope has nothing else to show, styled visually softer (e.g., "early signal" tag).
- Confidence is a **sample-size** grade and nothing more. It says the number is not noisy; it does not say the number is unbiased. That is a separate gate — see §4a.
- No editorializing language — "up 18%" not "hot market" or "don't miss out." No urgency framing ("act now," "limited time") — that's an ethical line for a platform whose whole pitch is honesty over hype.
- Never generate an employer-specific signal ("Acme Corp posted 5 jobs this week") without that employer's consent — this is the same boundary as declining the employer-honesty-score idea. Aggregate only; no single-employer call-outs in v1.

---

## 4a. Bias risk must be stated before a signal ships

**A sample-size threshold is a magnitude check. It cannot see a bias.** The original v1 cleared its own `≥10 in both windows` rule with samples in the hundreds and still produced "up 568%" for every role, because survivorship is not noise — it is a systematic tilt that gets *more* confident with more data.

So every new signal type must answer these in writing before it ships, alongside its threshold:

1. **Is this metric sensitive to when we started collecting?** A window longer than the index's own age cannot be honest. (Index age = oldest `firstSeenAt`.)
2. **Is it sensitive to collection completeness?** If adding or removing a source moves the number, it measures Topezia, not the market. `firstSeenAt` fails this by construction; so does anything counting "new" employers.
3. **Does the population change between the things being compared?** Live-only cohorts are depleted by age, so any two-window comparison over live rows is biased by default.
4. **What would this render if the underlying market were completely flat?** If the answer isn't "no signal", the metric is measuring something other than the market.

A signal that cannot answer all four ships as a **level** (§3) or not at all. Levels are immune to 1–3 by construction, which is the real reason v1 is levels-only rather than a temporary concession.

---

## 5. Optional: LLM rephrasing layer (skip for v1, revisit later)

If the template sentences feel too mechanical later, an LLM (Haiku-class, same as your extraction pipeline) can rephrase a signal row into more natural language — but strictly as a rewrite of the pre-computed fact, never as a generator of new facts. Guardrails if this is added:

- Prompt includes the exact numbers and must reproduce them verbatim (extraction-style constrained generation, not free composition).
- A validation step re-parses the LLM output and confirms the numbers match the source row before it's allowed to render; fall back to the template sentence on mismatch.
- This is a nice-to-have polish pass, not a v1 requirement — the template sentences in §3 are perfectly shippable as-is and carry zero hallucination risk.

---

## 6. Feed placement

- Insert one Market Signal card roughly every 6–8 job cards, scoped to the signals relevant to that user's tracked roles/verticals (reuse whatever preference/embedding signal already drives feed relevance — don't build a second targeting system).
- If a user has no signals available for their scope (new/thin vertical), fall back to their broader vertical-level signal rather than showing nothing.
- Card includes a small "based on N postings" footer — this is the trust mechanism, same spirit as showing real match scores instead of inflated ones. It also doubles as an implicit plug for data scale as it grows.
- Tapping a card can deep-link to the relevant programmatic SEO page (`/jobs/[role]/[location]`) from the SEO addendum — one more internal link, and it gives the signal somewhere to "go" without sending the user off-platform.

---

## 7. What this deliberately does NOT include (v1 scope guard)

- No third-party news ingestion, no RSS feeds, no Yahoo/AP/Reuters content of any kind.
- No per-employer signals (consent/reputational risk).
- No LLM-generated commentary beyond the optional constrained rephrasing in §5.
- No historical trend charts yet (the schema supports adding this later by not overwriting rows, but v1 keeps it simple).

---

## 8. Sequencing

**`page_stats` is a hard prerequisite, and it does not exist yet** — it is still the open item from the SEO addendum §5. Nothing in this document should start before it lands. Building a one-off aggregation for market signals now would be thrown away the moment `page_stats` arrives, and until then would be a second query drifting out of step with the first.

That ordering is also the better trade on its own: `page_stats` is load-bearing for the entire programmatic-SEO slice, not just this feature, and it makes market signals nearly free.

1. **Build `page_stats`** (SEO addendum §2.2): computed at the end of each ingestion run, keyed by `(page_type, role_id, location)`, holding listing count, median/p25/p75 pay + pay sample size, top skills, employment-type breakdown, remote share, `computed_at`. Scope by `locationState`/`country`, not a `locations` table — there isn't one.
2. **Stats blocks on the programmatic SEO pages** (SEO addendum §2.1) — the first consumer, and the one that proves the numbers.
3. **Market signal cards as a read layer** over that table: the four levels in §3, no new aggregation, no new table.
4. Feed placement logic (§6) + deep-link to the matching SEO page.
5. **(Later, needs history)** the delta signals in §3a, once retained `EXPIRED` rows span both windows. Each must pass §4a first.
6. **(Later, optional)** LLM rephrasing layer, if template copy feels stale after user feedback.
