# Topezia — Honest Caveats & Known Limitations

A running, deliberately honest list of what's incomplete, fragile, or deferred —
kept current as the build progresses. Ordered by area. Status: 🔴 blocks real
traffic · 🟠 should fix before launch · 🟡 known tradeoff / later.

## Infrastructure & database
- 🟢 **DB migrated to US-East (`us-east-1`).** Was Seoul (~1.3s/query cross-Pacific
  from Vercel's US functions). New Supabase project built fresh via
  `prisma migrate deploy` + seed + re-ingest; live site cut over and verified
  (Vercel now co-located with the DB). Old Seoul project can be deleted.
- 🟢 **Schema drift gone.** The fresh US DB was built entirely from Prisma
  migrations (not hand-run SQL), so it has none of the old `gen_random_uuid()` /
  `ARRAY[]` default drift — `migrate deploy` replayed all 7 migrations clean.
- 🟡 **Embedding columns are managed via raw migrations**, not `schema.prisma`
  (Prisma can't type `vector`). A future `migrate dev` could try to drop them
  unless declared as `Unsupported("vector(1024)")`.
- 🟡 **Vercel still has the old Seoul `NEXT_PUBLIC_SUPABASE_URL` / anon key**
  (DB URLs were updated; these client keys weren't). Harmless — only an unused
  auth path uses them — but update for tidiness. Also: the old Seoul DB password
  was changed, so `.env.seoul-backup` won't reconnect (fine; we're off Seoul).

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
- 🟢 **Skill resolution now batched** (`resolveSkillsMap`) — a fixed handful of
  queries instead of ~2-3 per skill. Cut profile save from ~21s → ~8s; also
  speeds ingestion.
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
- 🟢 **Progressive loading DONE — no more "forever loading."** `GET /api/matches`
  now returns Stage-1 (retrieval + hard filters + cached scores; uncached come
  back with a provisional similarity score and `pending=true`) with **no LLM
  call**, so jobs paint immediately. The feed then calls `POST /api/matches/rerank`
  to enrich pending cards with honest scores + why-lines in the background. No
  single request blocks on the ~15s rerank.
- 🟢 **Stage-1 latency fixed by the US DB move.** In production (Vercel US-East ↔
  us-east-1 DB) queries are single-digit ms, so Stage-1 is fast.
- 🟢 **Rerank caching DONE** (`MatchScore`, per profile-version × job). Warm feed
  loads make zero LLM calls: cold 22s → warm ~6s. Warm is now pure DB latency,
  so it collapses further with a US-region DB.
- 🟢 **Feed fails gracefully** — a matches error now shows a "Try again" screen
  instead of spinning forever.
- 🟠 **Cache invalidates on profile change only.** A job that's re-ingested or
  edited keeps its cached score/why-line until the seeker's profile is re-saved.
  Acceptable at Phase-1 cadence; revisit if job content changes frequently.
- 🟡 **Only the top ~12 retrieved candidates get an LLM score**; the rest of the
  retrieved pool isn't shown.

## Auth & product
- 🟠 **Email+password auth built (Supabase Auth), pending config to go live.**
  Sign up / log in (`/login`), session middleware, identity resolution
  (auth id → anon cookie fallback), and anon-profile linking on sign-in are all
  implemented; the anonymous "no account needed to start" flow still works. To
  activate: (1) put the US project's anon key in Vercel + local `.env`
  (`NEXT_PUBLIC_SUPABASE_URL` already set to the US project); (2) in the Supabase
  dashboard enable the Email provider, **disable "Confirm email"** (MVP: no email
  delivery), and set Site URL + redirect URLs; (3) redeploy. The final signup
  test is the owner's — I can't create accounts / enter passwords by policy.
- 🟡 **Résumé entry is text-paste only** — no file/PDF upload yet. The trucking
  8-question questionnaire path (§3.4) isn't built.
- 🟢 **Root `/` is now the product landing** (hero + CTA into `/onboard`);
  returning visitors with a profile redirect to `/feed`. The founding-employer
  waitlist still lives at `/waitlist` (linked from the landing nav).
- 🟡 **Feed "refine" input is a disabled placeholder**; the "Saved" filter is a
  stub (saves aren't wired).
- 🟡 **Layout B (structured-hourly cards for healthcare/trucking) isn't built** —
  the feed renders Layout A for everything. Current data is knowledge-work, so
  Layout B is untested.
- 🟢 **Test Profile rows cleared** from prod (0 profiles now).

## Not started (Slice 4, spec §7–9)
- 🟡 Programmatic SEO pages, sitemap, JobPosting schema emission.
- 🟡 Email alerts (Resend/Brevo).
- 🟡 CPC-feed monetization (Talent.com / Jooble / Appcast) + affiliate slots.
