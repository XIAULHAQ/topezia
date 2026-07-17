# Topezia — Phase 1 Master Specification

**Version:** 1.0 · **Status:** Working draft
**Purpose:** The single source of truth for the Phase 1 build. Every Claude Code session starts by reading the relevant section of this document. Update it when decisions change — the spec leads, the code follows.

---

## 1. Product definition

**One line:** Upload your résumé once. Topezia scans thousands of sources and shows you only the jobs actually worth your time — and tells you why.

**What Phase 1 is:** an AI-matched, aggregated job feed for job seekers. Résumé in → honest, explained, fresh job matches out → click through to the original publisher.

**What Phase 1 is not:** employer accounts, native job posting, one-click apply, messaging, projects marketplace, gigs, rich profile pages. (See §12.)

**Positioning pillars (these drive UX decisions):**
1. **Honesty** — real match scores including low ones, visible skill gaps, "why this fits / why it doesn't."
2. **Neutrality** — we show you the job, then send you to the employer to apply. The application *always* happens at the source; we never sit in the middle of it, and we never trap it. (Revised: originally "send users straight to the source". We now show a job detail page first — bouncing people off-site on the very first click meant we could never show the match reasoning that is the entire product. Neutrality is about not owning the application, not about refusing to render the job.)
3. **One profile, zero résumé tailoring** — the parse + per-job why-lines do the tailoring cognitively.
4. **Freshness** — aggressive expiry checking; every card shows "verified live Xh ago."

---

## 2. Launch market and verticals

**Market:** United States, English only.

**Deep verticals (ingestion depth + SEO seeding + beta recruiting):**
| # | Vertical | Role | Notes |
|---|----------|------|-------|
| 1 | Tech / software | Engine + founder edge | Cheapest ingestion (Greenhouse/Lever/Ashby), pipeline debugging vertical |
| 2 | Marketing / creative | Marketplace seed + founder edge | Freelance-native; feeds Phase 3 |
| 3 | Healthcare — allied health focus | Moneymaker | Imaging, PT/OT, lab, respiratory; avoid head-on nursing (Vivian) |
| 4 | Trucking & logistics | Moneymaker | CPC feeds are both supply and revenue here |
| 5 | *Open slot* | Evidence-based | Filled from SEO/traffic data ~60 days post-launch |

**Breadth tier:** all other verticals get baseline coverage from aggregator APIs only. No custom ingestion work.

---

## 3. Data model

### 3.1 Canonical job schema

Every job, from every source, normalizes into this shape. This schema is load-bearing: ingestion writes it, matching reads it, SEO pages query it, CPC tracking joins on it.

```
Job
├─ id                    uuid
├─ source                enum: greenhouse | lever | ashby | workable | smartrecruiters
│                              | adzuna | jooble | cpc_feed | jobposting_schema
├─ source_url            text (canonical click-out destination)
├─ source_company_slug   text (e.g. greenhouse board token)
├─ external_id           text (source's own id, for change detection)
├─ title_raw             text
├─ title_normalized      text (taxonomy role, e.g. "backend engineer")
├─ role_id               fk → taxonomy.roles
├─ vertical_id           fk → taxonomy.verticals
├─ company_name          text
├─ company_domain        text nullable
├─ description_raw       text
├─ description_hash      sha256 (dedup + cache key — never re-LLM identical text)
├─ skills                text[] (taxonomy skill ids, LLM/rules extracted)
├─ seniority             enum: intern | junior | mid | senior | lead | exec | n/a
├─ employment_type       enum: full_time | part_time | contract | hourly | temp
├─ salary_min, salary_max  int nullable
├─ salary_currency       char(3) default USD
├─ salary_period         enum: year | hour | day | per_mile | project
├─ location_raw          text
├─ location_geo          point nullable
├─ location_state        char(2) nullable (drives SEO state pages)
├─ remote_type           enum: onsite | hybrid | remote_us | remote_global
├─ vertical_fields       jsonb (see §3.2)
├─ embedding             vector(1536 or provider dim) — title + skills + condensed description
├─ posted_at             timestamptz
├─ first_seen_at         timestamptz
├─ last_verified_at      timestamptz (drives the freshness stamp)
├─ status                enum: live | expired | suspected_dead | duplicate
├─ duplicate_of          fk → job.id nullable
└─ cpc_feed_id           fk nullable (revenue attribution)
```

### 3.2 Vertical-specific fields (jsonb `vertical_fields`)

Two card layouts, four verticals:

**Layout A — knowledge work (tech, creative):** no extra required fields. Optional: `tech_stack[]`, `portfolio_required bool`.

**Layout B — structured hourly (healthcare, trucking):**
- Healthcare: `credentials_required[]` (RN, ARRT, RRT, PT, …), `shift_type` (day/night/rotating/prn), `contract_length_weeks`, `facility_type`.
- Trucking: `cdl_class` (A/B/C), `endorsements[]` (H, N, T, …), `pay_structure` (per_mile/hourly/salary/percentage), `home_time` (daily/weekly/otr), `route_type` (local/regional/otr/dedicated).

### 3.3 Taxonomy

Three linked tables, seeded once, extended as needed:
- `verticals` (~20 rows; 4 deep, rest breadth)
- `roles` (~300 rows to start; each maps to one vertical; carries `seo_slug` — the taxonomy IS the SEO page generator)
- `skills` (~2,000 rows to start; seed from O*NET/ESCO exports, add LLM-discovered skills behind a review flag)

Alias table maps raw strings → canonical ids ("React dev" → frontend engineer). Rules first, LLM fallback for unmatched strings, cache every resolution.

### 3.4 User profile schema

```
Profile
├─ user_id, resume_file_url, resume_text
├─ parse: full_name, headline_role (role_id), seniority, years_experience,
│         skills[] (each: skill_id, confidence 0–1, source: resume|confirmed|user_added),
│         work_history jsonb, education jsonb, certifications[]
├─ preferences: employment_types[], remote_types[], locations[],
│               salary_floor + period, verticals_opt_in[]
├─ embedding vector (headline + skills + condensed history)
└─ signals: clicks[], saves[], dismissals[] (each with job_id, ts) — ranking fuel
```

**Alternate entry path (trucking, later trades):** 8-question form producing the same Profile shape with `resume_file_url = null`. Questions: CDL class, endorsements, years driving, route preference, home time, freight experience, clean record y/n, pay floor.

---

## 4. Ingestion pipeline

### 4.1 Sources by vertical

| Vertical | Primary | Secondary |
|---|---|---|
| Tech | Greenhouse, Lever, Ashby public JSON endpoints | Adzuna API (breadth) |
| Creative | Same ATS set + agency careers pages (JobPosting schema crawl) | Adzuna |
| Healthcare | SmartRecruiters + Workable endpoints; hospital-system JobPosting schema crawl | Aggregator API filtered to allied roles |
| Trucking | CPC feeds (Talent.com, Jooble, Appcast) — supply and revenue in one | Adzuna |
| Breadth | Adzuna free tier + Jooble rev-share | — |

**ATS discovery:** company-slug lists compiled from public directories (YC directory, agency listings, hospital system lists), then probe `boards-api.greenhouse.io/v1/boards/{slug}/jobs` etc. Store discovered boards in a `sources` table with per-board crawl cadence.

**Founding-employer intake:** the waitlist form's "careers page URL" field feeds directly into `sources` with priority flag. Waitlist = supply pipeline.

### 4.2 Normalization ladder (cost control — treat LLM spend like rent)

1. **Rules/regex first:** salary patterns, state/city extraction, employment type keywords, remote keywords, CDL/credential patterns. Target: ≥50% of fields resolved with zero LLM calls.
2. **Small model second** (Haiku-class): skills extraction, seniority, title→role mapping for strings the alias table misses, Layout B vertical fields. Structured JSON output, temperature 0.
3. **Cache always:** `description_hash` lookup before any model call. Same text seen twice = zero cost.
4. **Embeddings:** cheap — embed every live job. Input = title + normalized skills + first ~1,000 chars of description.

### 4.3 Deduplication

Same job appears on multiple boards. Pipeline: (a) exact `description_hash` match → instant dupe; (b) same `company_domain` + fuzzy title (trigram > 0.85) + same location → dupe; (c) embedding cosine > 0.95 within same company → flag for dupe. Keep the most-direct source (ATS > aggregator > CPC feed); mark others `duplicate`, point `duplicate_of` at the survivor. **Exception:** if the CPC-feed copy pays and the ATS copy doesn't, keep the ATS copy as the displayed job — honesty and UX first; blend CPC-paying jobs on merit, never rank them above better organic matches.

### 4.4 Freshness / expiry

- ATS jobs: re-crawl board endpoint on cadence (deep verticals 2×/day); missing from response → `expired`.
- Crawled/schema jobs: HEAD/GET the `source_url` on 24h cadence; 404/410/redirect-to-listing → `suspected_dead` → confirm → `expired`.
- Aggregator/CPC: trust feed TTL, re-verify anything older than 48h before display.
- `last_verified_at` renders on every card. Never display anything unverified > 48h.

---

## 5. Matching engine

**Stage 1 — retrieval (cheap, every feed load):**
Hard filters: status=live, employment_type ∈ prefs, remote/location compatible, salary_max ≥ salary_floor (when salary present; salary-absent jobs pass but rank lower). Then pgvector cosine similarity profile↔job, top 200.

**Stage 2 — rerank + explain (small model, cached per profile-version × job):**
Scores 0–100 from: skill overlap (weighted by requirement language), seniority fit, trajectory logic (sensible next step), preference alignment. Outputs JSON: `{score, matched_skills[], gap_skills[], why_line}`.
- `why_line`: one sentence, plain language, references specifics ("Your caching and latency work is exactly what the post emphasizes").
- Cache key: profile version hash + job id. Re-rank only on profile change or new jobs.

**Honesty rules (product law, not style):**
- Score distribution must be earned. If everything scores 85+, thresholds are wrong.
- Feed shows some sub-70 matches with a "Why low?" affordance rather than hiding them.
- Gap skills always shown when present. No gap inflation to upsell (there is nothing to upsell yet — keep it that way in spirit).

**Learning loop (Phase 1 minimum):** log clicks/saves/dismissals. No model training yet — but a nightly job computes per-user dismissal patterns (e.g. dismisses all agency jobs) and converts strong patterns into soft filters. Full learning-to-rank is Phase 2.

---

## 6. UX specification — two hero screens

### 6.1 Screen A: Parse confirmation ("the last profile work you'll ever do here")

Post-upload, pre-feed. Single column, ≤90 seconds to complete.
1. Role + seniority + location line (tap to edit).
2. Skill chips — solid = confident, dashed + "confirm?" = low-confidence extraction. Tap to remove/confirm; add-skill input.
3. "Three things your résumé can't tell us": work type (multi), location/remote (multi), salary floor.
4. CTA: **Show my matches** → feed. Footer: "Edit any of this later from your feed."

Design language: Topezia brand (indigo primary, Sora headings, Plus Jakarta Sans body), calm density, no dashboard chrome.

### 6.2 Screen B: The feed (home)

- Top bar: logo · conversational refine input ("more remote, less agency work" — parsed by small model into filter deltas) · avatar.
- Filter pills with live counts: All matches · Remote · Hourly · Saved.
- **Job card (Layout A):** title, company · location · type; match score (big, honest); skill chips green(have)/amber(gap); why-line; footer = freshness stamp + source line ("via Greenhouse → applies on company site") + save + **View job** (→ the job detail page, §6.4).
- **Job card (Layout B):** adds credential/CDL chips, shift or home-time, pay structure; drops why-line to one shorter clause.
- Low-score cards render compact with "Why low?" expander.
- **Right rail (the whole profile surface in Phase 1):**
  1. "How Topezia reads you" — 2-line summary + Correct anything.
  2. "Right now" — N strong matches live, over M verified jobs.
  3. "Unlock more matches" — top gap skills with verifiable job counts (+41 jobs).
- Empty/thin states: fewer than 5 matches → show best available + honest note + alert signup, never pad with junk.

### 6.3 Click-out

`/go/{job_id}` redirect: logs click (user, job, position in feed, score), fires CPC attribution when applicable, 302 → `source_url`. This route is the revenue and the ranking signal — build it early, test it hard.

It is now reached from the **Apply** button on the job detail page (§6.4) rather than directly from the feed card. Feed score/position ride along as query params, so the ranking signal is unchanged. `/go/` stays `Disallow`ed in robots.txt — it's a redirect, not a page.

### 6.4 Job detail page — `/job/{job_id}`

Where **View job** lands, from the feed, the SEO pages (§7) and alert emails (§9). Singular `/job/` so it can't collide with the `/jobs/*` SEO lattice.

- Anatomy: title, company · location · type · pay; freshness stamp + source line; skill chips; the full job description; and **Apply on company site →** (top and bottom) which goes out via `/go/{id}`, with the honest note "Applies at {company} — we never sit between you and the employer."
- Carries a match CTA ("Is this actually worth your time?") for visitors without a profile — this page is the main SEO entry point for someone who has never heard of us.
- Expired/dead jobs render a "this role has closed" banner instead of an Apply button, rather than 404ing — an SEO-landed visitor deserves an explanation.
- **Descriptions are third-party HTML and MUST be sanitized** before render. Greenhouse in particular returns the description *entity-encoded*, and Ashby returns plain text; all three shapes have to be handled or the page shows raw markup (or worse, executes it).
- Not currently in sitemap.xml: republishing full descriptions has duplicate-content and ATS-ToS implications worth deciding deliberately before indexing thousands of them.

---

## 7. Programmatic SEO surface

- **Domain:** topezia.com.
- **URL scheme:** `topezia.com/jobs/{role-slug}` · `topezia.com/jobs/{role-slug}/{state}` · `topezia.com/jobs/remote-{role-slug}` · `topezia.com/jobs/{vertical-slug}` — all generated from taxonomy × live-job counts.
- **Generation rule:** page exists only if ≥5 live jobs match its query (thin pages poison SEO). Pages auto-publish/unpublish nightly on that rule.
- **Page anatomy:** H1, 2–3 sentence intro (LLM-written once per page, cached, regenerated monthly), live job list (same card component), email-alert capture above the fold, links to sibling pages (role↔state lattice = internal linking for free).
- **Launch target:** 2,000–4,000 pages, weighted to healthcare-by-state and trucking-by-city clusters (weakest incumbent coverage per search).
- Sitemap.xml auto-generated; JobPosting structured data embedded on our own pages (yes — we emit the same schema we crawl).

---

## 8. Monetization (live at launch)

1. **CPC feeds:** Talent.com, Jooble, Appcast integrations. Feed jobs enter the normal pipeline (schema, dedup, honest scoring). Attribution via `/go/` route. Target: first CPC dollars within launch month.
2. **Affiliate slots:** résumé review, interview prep, courses — one tasteful slot in feed footer + alert emails. Nothing interruptive.
3. **NOT in Phase 1:** job-seeker premium (revisit at 1k WAU), employer monetization (Phase 2, seeded by founding-employer waitlist).

**Founding-employer waitlist (parallel, pre-launch):** landing page offering Founding Employer status — priority placement badge + 12–24 months free of the future paid tier (NOT lifetime), capped at 100. Form collects company, contact email/phone, **careers page URL** (→ ingestion `sources` table).

---

## 9. Tech stack and budget guardrails

| Layer | Choice | Budget note |
|---|---|---|
| Frontend + API | Next.js on Vercel | Free tier |
| Database | Supabase or Neon Postgres + pgvector | Free tier; watch row limits |
| Workers (crawl/normalize/verify) | Python on Railway/Render hobby | $0–20/mo |
| LLM | Haiku-class for extraction/rerank; embeddings via cheapest solid provider | The line to watch — see §4.2 ladder |
| Email (alerts) | Resend/Brevo free tier | $0 at launch volume |
| Analytics/errors | PostHog + Sentry free tiers | $0 |
| Auth | Supabase auth or NextAuth | $0 |

**Hard budget:** $1,000 total to launch (ceiling $1,400). **Index target:** 15–25k live jobs, ≥70% in the four deep verticals. **Non-goals at this budget:** proxies at scale, paid data feeds, paid marketing, legal spend (deferred to first revenue — privacy policy from a reputable template in the interim; résumé data means this is deferred, not optional).

---

## 10. Build slices (12–16 weeks part-time)

| Slice | Weeks | Ships | Definition of done |
|---|---|---|---|
| 1 Foundation | 1–3 | Schema, taxonomy seed, auth, URL architecture, `/go/` route | Migrations run; taxonomy loaded; redirect logs clicks |
| 2 Ingestion | 3–7 | ATS crawlers, 1 aggregator, normalization ladder, dedup, expiry | 15k+ live jobs; dupe rate <3% spot-checked; freshness ≤48h |
| 3 Profile + matching | 6–10 | Upload→parse→confirm screen, 2-stage matcher, feed + both card layouts | 50-résumé test set parses ≥90% clean; feed loads <1.5s |
| 4 Growth surface | 10–14 | SEO pages, email alerts, trucking questionnaire path, analytics | 2k+ pages live; alerts sending; sitemap submitted |
| — Beta | 14–16 | 50 users (20 tech, 15 creative, 10 allied health, 5 drivers) | Fix list triaged; then public launch |

**Working method with Claude Code:** one slice = one milestone; within a slice, one module per session (e.g. "greenhouse crawler," "dedup pass," "feed card component"). Start every session by pasting the relevant spec section. When reality contradicts the spec, update the spec first.

---

## 11. Success metrics (Phase 1)

- **Activation:** % of signups who complete parse-confirm AND click ≥1 job (north star; target ≥40%).
- **Feed honesty check:** score distribution has real spread (median 60–75, not 85+).
- **Freshness:** <2% of clicked jobs report dead on arrival.
- **Supply:** 20k+ live jobs, dedup <3%.
- **SEO:** first non-brand organic clicks by week 6 post-launch; 2k indexed pages.
- **Revenue:** first CPC dollars within 30 days of launch.

---

## 12. Deferred — explicitly parked, not rejected

- **Phase 2:** employer accounts + native posting; one-click apply; learning-to-rank; skilled trades vertical (reuses trucking questionnaire pattern); shareable career-fit report; job-seeker premium; legal/incorporation on first revenue; **rich profile pages for individuals AND companies** — full-featured dashboard experience per the Topezia reference design (AI insights, career analytics, company pages), deliberately not LinkedIn-shaped: profile as instrument, not performance. Phase 1's right rail is the seed of this, and Phase 1's signals data (clicks, saves, matches) is what will make it genuinely intelligent rather than decorative.
- **Phase 3:** projects marketplace (post project → proposals → contracts → payments/escrow) seeded in the creative vertical; messaging.
- **Phase 4:** gigs (Fiverr-style storefronts).

---

*End of spec. Argue with this document before arguing with the code.*
