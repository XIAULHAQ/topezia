# Topezia — Honest Caveats & Known Limitations

A running, deliberately honest list of what's incomplete, fragile, or deferred —
kept current as the build progresses. Ordered by area. Status: 🔴 blocks real
traffic · 🟠 should fix before launch · 🟡 known tradeoff / later.

## Infrastructure & database
- 🔴 **DB is in Seoul (`ap-northeast-2`), ~1.3s per query.** Very high latency for
  a US-first product. Ingest runs ~27s/job and feed matching is slow. Move to a
  US-region Postgres before real traffic.
- 🟡 **Benign schema drift.** The live DB has `DEFAULT gen_random_uuid()` on all id
  columns and `DEFAULT ARRAY[]` on Profile array columns that `schema.prisma`
  doesn't express (harmless — Prisma overrides on insert), but `prisma migrate
  dev` will report drift. Reconcile with `@default(dbgenerated("gen_random_uuid()"))`.
- 🟡 **Embedding columns are managed via raw migrations**, not `schema.prisma`
  (Prisma can't type `vector`). A future `migrate dev` could try to drop them
  unless declared as `Unsupported("vector(1024)")`.

## Ingestion
- 🟢 **Company name FIXED.** Greenhouse now auto-fetches the real name from board
  metadata; Ashby/Lever (which don't expose it) use a `Source.companyName`
  override; last-resort fallback is a title-cased slug. Existing 49 jobs
  backfilled (Dropbox, Discord, PostHog, Linear, Lever Demo). Remaining nuance:
  a newly-discovered Ashby/Lever board with no override shows a title-cased slug
  until a name is set.
- 🟡 **Skill sprawl.** LLM extraction coins many skills (49 from 10 jobs, some
  phrases not atomic skills). They're now flagged `reviewed=false` (§3.3), but
  nothing consumes that flag yet — SEO/gap-count features must filter on it.
- 🟡 **Per-skill DB queries** in taxonomy resolution — a batching opportunity;
  a big part of the ~27s/job ingest cost.
- 🟡 **On LLM/API error a job is skipped and retried next run** (no partial save),
  so a credit lapse or provider outage yields 0 jobs rather than degraded ones.
- 🟡 **Dedup rule (c)** needs both jobs already embedded; genuine near-duplicate
  postings (e.g. two PostHog "Backend Engineer" US/EU listings) can both survive.
- 🟡 **Lower-severity ingestion bugs, unfixed:** LLM cache in `extractWithLlm` is
  effectively dead code and the exact-hash dedup path ignores source priority
  (#4); Lever's `commitment` employment hint is captured but unused (#8);
  `new URL(careersPageUrl)` can throw on a malformed waitlist URL (#9).

## Embeddings & matching
- 🟠 **Voyage is on the free tier (3 req/min).** Embedding backfills and ingests
  are rate-limited; add a payment method before real volume.
- 🟢 **Rerank caching DONE** (`MatchScore`, per profile-version × job). Warm feed
  loads make zero LLM calls: measured cold 34s → warm 7.4s (4.6×). The warm 7.4s
  is now entirely Seoul-DB round-trips, so it collapses further with a US-region
  DB (see Infrastructure).
- 🟠 **Cache invalidates on profile change only.** A job that's re-ingested or
  edited keeps its cached score/why-line until the seeker's profile is re-saved.
  Acceptable at Phase-1 cadence; revisit if job content changes frequently.
- 🟡 **Only the top ~12 retrieved candidates get an LLM score**; the rest of the
  retrieved pool isn't shown.

## Auth & product
- 🟠 **Job-seeker auth is a stopgap anonymous cookie**, not real Supabase Auth.
  Clearing cookies loses the profile; no cross-device continuity.
- 🟡 **Résumé entry is text-paste only** — no file/PDF upload yet. The trucking
  8-question questionnaire path (§3.4) isn't built.
- 🟡 **`/` redirects to `/waitlist`** (founding-employer). The job-seeker entry is
  `/onboard`, not yet linked from anywhere public.
- 🟡 **Feed "refine" input is a disabled placeholder**; the "Saved" filter is a
  stub (saves aren't wired).
- 🟡 **Layout B (structured-hourly cards for healthcare/trucking) isn't built** —
  the feed renders Layout A for everything. Current data is knowledge-work, so
  Layout B is untested.
- 🟡 **Test artifacts in prod:** a couple of test Profile rows from verification.

## Not started (Slice 4, spec §7–9)
- 🟡 Programmatic SEO pages, sitemap, JobPosting schema emission.
- 🟡 Email alerts (Resend/Brevo).
- 🟡 CPC-feed monetization (Talent.com / Jooble / Appcast) + affiliate slots.
