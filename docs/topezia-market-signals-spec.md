# Topezia — Market Signal Cards Spec

> **Status:** New feature spec, additive to the feed. Not a replacement for any existing slice — can ship whenever ingestion volume supports it (already true at current scale: 13,556 jobs / 128 sources).
> **Origin:** Replaces the "third-party news snippet" idea. Rejected that approach for licensing risk (republishing AP/Reuters-sourced content without full attribution/outbound links) and low differentiation. This spec uses Topezia's own ingested data instead — legally clean, on-brand with the honesty-through-data positioning, and reuses the ingestion pipeline with no new external dependency.

---

## 1. Concept

A **Market Signal** is a short, data-backed observation about a user's field, computed entirely from listings already in the database. It renders as a feed card interleaved with job cards — same visual rhythm as job cards, distinct enough to signal "this is insight, not a listing."

Examples of the sentence shapes to generate (not literal copy — see §3 for exact templates):

- "Travel nurse postings in Texas are up 18% this month."
- "3 new companies started posting frontend roles this week."
- "Median rate for graphic designers moved from $42/hr to $45/hr over the last 30 days."
- "Remote share for backend roles is now 61%, up from 48% last quarter."

All numbers trace directly to a query Claude Code can point to — no LLM-generated numbers, ever. If an LLM is used at all (optional, see §5), it only rephrases a pre-computed fact, it never invents or estimates one.

---

## 2. Data model

New table, computed at the end of each ingestion run (same job that already produces `page_stats` from the SEO addendum — this reuses that computation, don't duplicate it):

```sql
create table market_signals (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,        -- 'role' | 'role_location' | 'vertical' | 'remote_role'
  role_id uuid references roles(id),
  location_id uuid references locations(id),  -- nullable
  vertical_id uuid references verticals(id),  -- nullable
  signal_type text not null,       -- see §3 enum
  metric_value numeric,            -- the computed delta/value
  metric_unit text,                -- 'percent' | 'usd_hour' | 'usd_year' | 'count'
  comparison_window text not null, -- '7d' | '30d' | '90d'
  confidence text not null,        -- 'high' | 'low' — see §4
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null  -- computed_at + comparison_window, signal stops surfacing after this
);
```

- One row per (scope, signal_type, window) per computation run — overwrite/upsert rather than accumulate history, unless you want a "trend over time" feature later (out of scope for v1).
- Indexed on `(role_id, expires_at)` and `(vertical_id, expires_at)` for feed lookup.

---

## 3. Signal types (v1 — ship these four, nothing else)

Keep the list small. A feed with 12 signal types feels like noise; 4 feels like insight.

| `signal_type` | Template | Data source |
|---|---|---|
| `posting_volume_change` | "{role} postings in {location} are up/down {pct}% this {window}" | count of active listings this window vs. prior window, same scope |
| `new_employer_activity` | "{n} new companies started posting {role} roles this week" | distinct employers with first-ever listing in scope, in last 7d |
| `rate_shift` | "Median rate for {role} moved from ${old} to ${new}/{unit} over the last {window}" | median `baseSalary` this window vs. prior window |
| `remote_share_shift` | "Remote share for {role} is now {pct}%, up/down from {old_pct}% last {window}" | % remote this window vs. prior window |

Rules:

- **Minimum sample size to generate a signal at all: 10 listings in both the current and comparison window.** Below that, don't generate the row — small-sample deltas are noise and undermine the honesty positioning ("up 40%!" from 2→3 postings is misleading, not honest).
- **Minimum meaningful delta to surface:** ±5% for posting_volume/remote_share, ±$1/hr or ±$2,000/yr for rate_shift. Compute smaller deltas but don't feed-surface them — store them (useful for future trend features) but mark `confidence: 'low'` or skip insertion.
- Round all displayed numbers the same way as `page_stats` in the SEO addendum (consistency between feed and SEO pages matters — a user shouldn't see two different numbers for the same fact).

---

## 4. Confidence & tone guardrails

Same principle as the match-score framing from earlier: **describe the market, never judge the user or the employer.**

- `confidence: 'high'` = sample size ≥ 25 in both windows. `'low'` = 10–24. Only render `'high'` signals by default; `'low'` signals are a fallback if a scope has nothing else to show, styled visually softer (e.g., "early signal" tag).
- No editorializing language — "up 18%" not "hot market" or "don't miss out." No urgency framing ("act now," "limited time") — that's an ethical line for a platform whose whole pitch is honesty over hype.
- Never generate an employer-specific signal ("Acme Corp posted 5 jobs this week") without that employer's consent — this is the same boundary as declining the employer-honesty-score idea. Aggregate only; no single-employer call-outs in v1.

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

1. Extend the ingestion run to compute `market_signals` alongside `page_stats` (shared computation window logic — do this in the same job, not a separate cron).
2. Backfill signal rows once against current data (13,556 jobs is plenty of sample size to validate the queries before wiring up the feed).
3. Feed card component + placement logic.
4. Deep-link to SEO pages.
5. (Later) LLM rephrasing layer, if template copy feels stale after user feedback.
