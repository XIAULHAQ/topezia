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

## Job detail page (product change vs. spec)
- 🟢 **`/job/{id}` detail page BUILT.** Feed, SEO pages and alert emails now land
  people on OUR page; "Apply on company site" goes out through the tracked `/go`
  redirect (feed score/position carried through, so the ranking signal survives).
  Third-party description HTML is sanitized (rendering it raw would be an XSS
  hole); plain-text sources get paragraphs rebuilt from newlines.
- 🟢 **Spec updated to match** (§1 pillar 2 reworded, §6.2 card footer, new §6.4
  "Job detail page"). Neutrality now reads as "we never own the application",
  not "never render the job".
- 🟡 **Job pages aren't in the sitemap.** Republishing full descriptions raises
  duplicate-content and ATS-ToS questions worth a decision before indexing
  thousands of them. They're crawlable via the SEO pages either way.

## Ingestion
- 🟢 **Company name FIXED.** Greenhouse now auto-fetches the real name from board
  metadata; Ashby/Lever (which don't expose it) use a `Source.companyName`
  override; last-resort fallback is a title-cased slug. Existing 49 jobs
  backfilled (Dropbox, Discord, PostHog, Linear, Lever Demo). Remaining nuance:
  a newly-discovered Ashby/Lever board with no override shows a title-cased slug
  until a name is set.
- 🟢 **Lever RESOLVED** (was 🔴 "no live Lever source"). `leverdemo` — Lever's own
  sample board, which once leaked fake "Account Executive (copy)" rows into a
  real alert email — is gone, replaced by four real boards: Palantir, Meesho,
  Qonto, Waabi. Verified 2026-07-30: 386 live Lever jobs, all four crawled within
  the last hour by the scheduled cron.
- 🔴 **Pakistan employers are essentially absent from Greenhouse/Lever/Ashby.**
  Probed 85 candidate boards against the live endpoints on 2026-07-30: Systems
  Ltd, NETSOL, 10Pearls, Arbisoft, Devsinc, Contour, Folio3, VentureDive,
  Tintash, Confiz, Gaditek, Daraz, Bazaar, Retailo, Bykea, PostEx, Abhi,
  Safepay, Zameen/Dubizzle and Trukkr **all 404 on all three ATSs**. They hire
  via Rozee.pk, Mustakbil, LinkedIn or their own sites. Only two boards carry
  real PK-located roles (Careem 12, Educative 10). **Adding more slugs cannot
  fix this** — real PK inventory needs a new crawler for an ATS those companies
  actually use (Workable / SmartRecruiters / BambooHR are the usual suspects and
  all have public JSON endpoints). Until then PK seekers are served by
  eligibility: globally-remote roles surface on `/jobs/pakistan` because country
  pages count "located there OR hireable from anywhere".
- 🟡 **A live board is not proof of the right company.** `aha` was probed and
  rejected: that Greenhouse slug belongs to a veterinary practice
  ("Credentialed Veterinary Technician"), not Aha! the software company. HTTP
  200 + non-empty only proves a board exists. Check the titles before adding.
- 🟢 **Source volume is no longer the constraint.** 128 sources (88 Greenhouse,
  36 Ashby, 4 Lever), zero never-crawled. Live listings as of 2026-07-30:
  **13,556 jobs** (Greenhouse 9,994 · Ashby 3,175 · Lever 386 · 1 native) plus
  928 freelance projects. Any figure in this file older than that — the "39 jobs"
  era — describes a database that no longer exists; re-query before quoting.
- 🟢 **Greenhouse noisy-text issue RESOLVED** (was 🟠). Greenhouse returns
  entity-encoded HTML which `stripHtml` didn't decode, so ~78% of each description
  fed to Haiku and the embedding model was raw markup. The decode fix landed, and
  the ~39 jobs that carried the bad text/skills/embeddings have long since expired
  and been replaced — every one of the current 13.5k was ingested after the fix.
- 🟠 **Ashby descriptions are stored as plain text.** The crawler prefers
  `descriptionPlain` over `descriptionHtml`, so detail pages lose real lists and
  headings (we rebuild paragraphs from newlines as a fallback). Switch to
  `descriptionHtml` at the next full re-ingest — changing it now would re-hash
  every Ashby job and duplicate them.
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
- 🟢 **Real email+password auth is LIVE and verified in production.** Supabase
  Auth (email provider on, signups allowed, confirm-email off → instant signup,
  no email delivery needed). `/login`, session middleware, identity resolution
  (auth id → anon cookie fallback), and anon-profile linking all working;
  the anonymous "no account needed to start" flow is preserved. Verified live:
  account created and the pre-signup anonymous profile (13 skills, 12 cached
  match scores) migrated onto it — profiles now survive cookie-clears and work
  cross-device.
- 🟢 **Signup emails are VERIFIED as of 2026-07-30** — `mailer_autoconfirm` is
  now `false`. Before the flip, `email_confirmed_at` landed 0.03–0.06s after
  `created_at` for all 11 users, i.e. auto-confirm; those legacy accounts keep
  their confirmed status, and only new signups face the real check.
- 🟢 **Custom SMTP is live: Resend, `smtp.resend.com:465`, user `resend`,
  sender `no-reply@mail.topezia.com`.** The sender MUST stay on
  `mail.topezia.com` — that is the domain Resend has verified, and a plain
  `@topezia.com` sender is rejected. Credentials were checked by opening an
  SMTP session and authenticating (ports 465 and 587 both OK) rather than by
  sending anything.
- 🔴 **The built-in mailer allowed 2 emails PER HOUR, site-wide**
  (`rate_limit_email_sent: 2`, the Supabase default). Turning on Confirm Email
  without custom SMTP first would have broken signup for everyone after the
  second person each hour. Now 30/hour, with Resend's daily quota as the real
  ceiling. **If signups ever fail silently at scale, check this number first.**
- 🟡 **The confirmation template was switched to `{{ .TokenHash }}`.** It now
  links to `{{ .SiteURL }}/auth/callback?token_hash=…&type=signup`. The
  recovery template still uses `{{ .ConfirmationURL }}` and was deliberately
  left alone — the app sends its own reset mail via Resend and links to
  `/reset?token_hash=`, bypassing Supabase's template entirely.
- 🟢 **The CODE side of turning it on is now done (2026-07-30).** Both signup
  forms pass `emailRedirectTo` pointing at the current origin, and
  `/auth/callback` handles the confirmation link as well as OAuth. Verified by
  probing every branch: no params, `error_description`, `token_hash&type=signup`
  (reaches Supabase's real verifier), `type=recovery` (refused by our own
  allow-list, since recovery belongs to `/reset`), and `code=` (PKCE).
- 🔴 **KNOWN LIVE BUG — confirming in a different browser orphans the
  pre-signup profile.** Reproduced 2026-07-30: account created in incognito,
  confirmation link opened in the normal browser. `/auth/callback` ran in a
  browser with no `ANON_COOKIE`, so the anon→account migration found nothing to
  move; the account ended up with zero profiles and the callback correctly sent
  it to `/onboard`. Evidence in production: `email2xia@gmail.com` (confirmed
  +41.8s, 0 profiles) alongside an orphaned Profile named "top" whose `userId`
  matches no `auth.users` row.
  - This will hit ordinary users, not just testers — signing up on a laptop and
    reading mail on a phone is the normal case. The `{{ .TokenHash }}` template
    makes the CONFIRMATION work cross-device; it does nothing for the profile
    migration, which needs a cookie that only exists in the original browser.
  - **The agreed fix is a design change, deferred 2026-07-30 ("keep the logic,
    we can work on it later"):** grant the session at signup, migrate the anon
    profile immediately in the same browser, and verify email afterwards on a
    7-day grace period with a dashboard countdown, going dormant (NOT deleted —
    dormancy is reversible and an auto-delete timer is not) if unverified.
    That model removes this bug structurally rather than patching it, because
    confirmation stops carrying any profile-migration burden.
  - Until then: someone who hits it can sign in again **in the original
    browser**, where `/api/auth/link` still finds the anon cookie and migrates.
- 🔴 **ORDER OF OPERATIONS, recorded because getting it wrong breaks signup
  silently.** The template now points at `/auth/callback?token_hash=…`, which
  the OLD deployed callback did not understand. Applied in this sequence:
  (1) deploy the callback + `emailRedirectTo` code, (2) verify production
  actually serves it, (3) set SMTP, allow-list and template, (4) only then flip
  `mailer_autoconfirm`. Doing (4) before (1) would have sent every new member a
  dead link. Step 2 was a real probe, not an assumption — production answered a
  bogus `token_hash` with Supabase's *"Email link is invalid or has expired"*,
  proving the new branch was live.
- 🔴 **Redirect URLs needed WILDCARDS, not exact paths.** The allow-list held
  `https://www.topezia.com/auth/callback` exactly, which does **not** match
  `/auth/callback?next=…` or the `/r/{token}` return the endorsement signup
  uses — Supabase would have silently fallen back to Site URL. Now
  `https://www.topezia.com/**,https://topezia.com/**,http://localhost:3100/**`.
- 🟡 **Supabase's built-in email is rate-limited** (a handful an hour) and is
  not a sending domain anyone trusts. `RESEND_API_KEY` already exists — set
  custom SMTP in Auth → Emails before signup volume matters, or confirmations
  will silently stop arriving.
- 🟡 **No password reset / logout UI yet.** Supabase supports reset out of the
  box but it needs email delivery (same dependency as above).
- 🟢 **Résumé upload BUILT** — PDF / DOCX / txt, drag-and-drop, parsed in memory
  and **never stored** (a résumé is sensitive personal data; we only need the
  text, so keeping the file is liability with no upside — `resumeFileUrl` stays
  null). Scanned/image PDFs, oversized files and wrong types get real messages,
  not a 500. Paste remains as a fallback.
- 🟠 **"Connect LinkedIn" is not buildable as envisioned.** LinkedIn has no
  profile-import API for apps like us — "Sign in with LinkedIn" returns only
  name/email/photo, not work history or skills; full access needs a Talent
  Solutions partnership, and scraping violates their ToS. The honest equivalent,
  now shipped: the user exports their own profile (More → Save to PDF) and drops
  it into the uploader. Onboarding says exactly that.
- 🟡 **The trucking 8-question questionnaire path (§3.4) isn't built.**
- 🟡 **Parse gaps vs. the product vision:** no industries, no candidate location,
  and skills carry extraction *confidence* ("did the résumé really say this?")
  rather than *proficiency* ("how good are they?") — different things.
- 🟡 **Preference gaps:** "locations you'd consider" exists in the schema but
  onboarding never asks (hardcoded `[]`); no visa/work-authorization question;
  salary is a floor, not a range.
- 🟢 **Root `/` is now the product landing** (hero + CTA into `/onboard`);
  returning visitors with a profile redirect to `/feed`. The founding-employer
  waitlist still lives at `/waitlist` (linked from the landing nav).
- 🟡 **Feed "refine" input is a disabled placeholder**; the "Saved" filter is a
  stub (saves aren't wired).
- 🟡 **Layout B (structured-hourly cards for healthcare/trucking) isn't built** —
  the feed renders Layout A for everything. Current data is knowledge-work, so
  Layout B is untested.
- 🟢 **Test Profile rows cleared** from prod (was 0 profiles on 2026-07-18; 8 now,
  from real signups — the count moves, so don't read a number here as current).

## PageStats
- 🟢 **BUILT 2026-07-30** (migration 043, applied by hand per
  `docs/runbooks/prisma-baseline.md`, never `migrate dev`). `lib/seo/page-stats.ts`
  computes 448 pages across 5 scope families — role (34), vertical (10),
  remote-role (30), role-state (200), role-country (174) — and runs at the END of
  `scripts/run-ingestion.ts`, never at request time. `npm run page-stats` re-runs
  it standalone.
- 🟢 **Sanity-checked against real output**, not just "it ran":
  `/jobs/remote-backend-engineer` is 100% remote (the scope filter works),
  `/jobs/backend-engineer/ca` is 77 listings (matches the sitemap), and
  `/jobs/backend-engineer` reports median $200,500/yr from 72 postings with
  Python/AWS/Kubernetes on top.
- 🟡 **Top skills need a SHARE floor, not just rank** (`MIN_SKILL_SHARE`, 10%).
  The first run gave `/jobs/account-executive` top skills "SQL" (8 of 565
  listings) and "AWS" (3 of 565) — not AE skills at all, just the only
  *reviewed* skills present, because the seeded skill list is tech-heavy. Rank
  alone made 1.4% look like a headline. A scope with nothing above the floor now
  renders no skill block, which is the honest answer.
- 🟡 **Pay is the DOMINANT type only.** Mixing hourly and annual into one median
  describes nothing, so `payType` records which the figures mean. Whole-DB split
  is YEAR 2,097 / HOUR 53, so a scope with 10+ of both is currently
  hypothetical; when it isn't, add a second row keyed by payType rather than
  averaging across types.
- 🟡 **The upsert loop is one round-trip per page.** 448 sequential upserts is
  ~2s co-located on the cron runner but minutes from a laptop — don't judge it by
  local wall-clock. Batch it if the page count grows an order of magnitude.
- 🔴 **Regression shipped and fixed the same day**: the React `cache()` added to
  `lib/seo/pages.ts` in the `/jobs` perf fix (commit `703416f`) made that module
  fail at IMPORT time outside a React runtime, which broke
  `scripts/generate-page-intros.ts` and therefore the weekly `page-intros-cron`.
  It would have failed silently until someone noticed missing intros. Fixed with
  a `perRequest` fallback that degrades to identity outside React. **Lesson: a
  module imported by both Next and plain scripts cannot call React-only APIs at
  module scope.** `lib/seo/page-stats.ts` deliberately imports `countrySlugFor`
  from `lib/countries`, not from `lib/seo/pages`, to stay script-safe.

## Market Signals (spec revised 2026-07-30 — NOT built; blocked on page_stats)
Spec at `docs/topezia-market-signals-spec.md`. The concept is sound and the
guardrails are right. What follows is measured against the live database, not an
opinion about the design — **all four v1 signals are delta signals, and Topezia
does not yet have the history to compute a delta honestly.**
- 🔴 **The index is 14 days old** (oldest `firstSeenAt` = 2026-07-16, after the
  US-East rebuild). A `90d` comparison window has no data to compare against, and
  `30d vs prior 30d` is only partly covered.
- 🔴 **Survivorship bias makes `posting_volume_change` report a fake surge for
  every scope.** We hold live postings; boards remove filled roles, so the
  0–30d cohort is systematically fuller than the 30–60d one. Measured on real
  data: account-executive 460 vs 62, backend-engineer 274 vs 64, engineering-
  manager 172 vs 49 — that is "up 568%" for every role, always. Including
  non-LIVE rows barely moves it (481/72) because **there are zero EXPIRED rows
  yet** — only LIVE (13,556) and DUPLICATE (573).
- 🟢 **Expiry MARKS rather than deletes** (`lib/ingestion/expiry.ts` sets
  `SUSPECTED_DEAD` then `EXPIRED`), so the history needed for honest deltas will
  accrue on its own. It just doesn't exist yet. Nothing to build for this; only
  time.
- 🔴 **`new_employer_activity` is currently an artifact of our own seeding**: 98
  of 128 companies had their first listing in the last 7 days, because we added
  boards, not because employers entered the market.
- 🟡 **`firstSeenAt` must never drive a volume signal** — it records when
  Topezia crawled a posting, so adding Datadog (425 jobs) would render as
  "backend postings up 300%". `postedAt` is the honest field and is present on
  **100%** of live jobs.
- 🟡 **`rate_shift` is thin but real**: only 15.9% of live jobs carry a salary
  range (2,150 of 13,556), all USD, split HOUR 53 / YEAR 2,097. 12 roles clear
  ≥10 paid listings in 30d. Currency is not a problem today; sample size and the
  window problem are.
- 🟢 **`remote_share_shift` has the data** (2,813 of 13,556 remote, 20.8%) — but
  as a *level*, not a delta, for the same window reason.
- **Two hard blockers in the spec's own §8 step 1**, independent of the above:
  `page_stats` **does not exist** (still the open Slice 4 item), and there is
  **no `locations` table** — the schema stores `locationState` (US-only string) +
  `country` (ISO-2) on `Job`, so `location_id references locations(id)` has
  nothing to point at. The DDL is also snake_case against PascalCase tables, and
  `baseSalary` is a JSON-LD field name, not a column (`salaryMin`/`salaryMax`/
  `salaryPeriod`).
- 🟢 **Spec revised and agreed**: v1 is now four LEVEL signals reading straight
  off `page_stats` — no `market_signals` table until deltas arrive, since a
  delta is the only thing `page_stats` can't already answer. Deltas deferred to
  v2 behind real history. The spec also gained §4a: a new signal type must state
  its BIAS risk, not just its sample-size threshold — the original rule cleared
  samples in the hundreds and still produced "up 568%" for every role.
- **Next action is `page_stats`, not this.** It is the hard prerequisite, it is
  load-bearing for the whole programmatic-SEO slice, and building a one-off
  aggregation for signals first would be thrown away the moment it lands.

## Spam & UGC abuse (added 2026-07-30)
- 🔴 **The hole this closed, stated plainly.** Before this pass, two
  unauthenticated HTTP requests produced an indexed page on topezia.com
  carrying a **dofollow** link to any domain: `POST /api/profile` needs no
  account (deliberately — profile-building starts pre-signup), `PATCH
  /api/profile` accepts the anonymous cookie and sets `websiteUrl`,
  `publicVisible` defaults `true`, `ensurePublicSlug` mints the URL, and
  `profileMetadata` returned `index: true` unconditionally. **Verified on
  production HTML**, not inferred: `/p/muhammad-zia-ul-haq` served
  `<meta name="robots" content="index, follow">` and
  `rel="noopener noreferrer"` with no `nofollow`. That is exactly the shape
  profile-spam farms automate against. No spam had actually arrived yet (8
  profiles, all real), so this is preventive.
- 🟢 **Layer 1 — the payoff is gone.** Every member-supplied outbound link now
  renders `rel="ugc nofollow noopener noreferrer"` (`UGC_REL` in `lib/ugc.ts`):
  profile LinkedIn/GitHub/website, publication DOI and URL. This is the
  load-bearing defence — it works against spam that reads perfectly human.
  Verified in rendered HTML: 3 `ugc` rels, 0 remaining dofollow member links.
- 🟢 **Layer 2 — thin and anonymous pages leave the index.**
  `indexability()` in `app/p/profile-data.ts` requires an account, a substance
  bar (name + role-or-3-skills + at least one real section) and a clean spam
  score. Failing it is `noindex, follow` — **not** a 404 and not visible to the
  member; the page works and shares normally. Verified against all 8 production
  profiles: 7 real ones index, the thin `PEPSI` test profile flipped to
  `noindex, follow`.
- 🟢 **The account check now means what it says (as of 2026-07-30).** Supabase
  `mailer_autoconfirm` is **false** — Confirm Email is ON — so layer 2's first
  condition is *controls that address*, not merely *has an account*. The query
  was written against `email_confirmed_at` from the start precisely so this
  strengthened itself the moment the toggle flipped, with no code change.
  Accounts created BEFORE the flip were auto-confirmed and keep that status;
  the stronger bar applies to new signups only.
- 🟢 **Layer 3 — content scoring at the write paths.** `scoreUgc()` in
  `lib/ugc.ts` weighs link volume, throwaway TLDs, chat-app handoffs, spam
  vocabulary, invisible/homoglyph characters, keyword stuffing and shouting.
  `SPAM_REJECT` (60) refuses the write on portfolio (`lib/portfolio/save.ts`
  `validate`, so POST and PATCH both), publications and endorsement text;
  `SPAM_REVIEW` (30) only withholds indexing.
- 🟡 **The two error modes are deliberately asymmetric.** A false REJECT blocks
  a real member from describing their own work; a false REVIEW only withholds a
  page from Google. So REJECT needs several independent signals to agree.
  Concretely: keyword classes carry **two** weights, because this site's
  audience includes marketing, SEO and iGaming professionals — "seo services",
  "buy now" and "online casino" are things real members were paid to do, and
  score 20 (never enough alone to refuse), while "slot gacor" and "replica
  watches" score 45. What separates an SEO consultant from a link farm is not
  vocabulary but **where the links point**, hence the throwaway-TLD signal.
- 🔴 **Profile writes are NOT spam-blocked, on purpose.** Profile fields come
  from an LLM parse of a real CV, and real CVs carry phone numbers and links —
  measured: 3 of 8 production résumés score at `review` on raw text (up to 20
  links). Spam on a profile is handled by refusing to **index** it, never by
  refusing the member's own edit. The index gate scores public fields only,
  never `resumeText`.
- 🟢 **Auth gap closed:** `/api/publications` checked `userId` only, so the
  anonymous cookie satisfied it — unlike `/api/portfolio`, `/api/company`,
  `/api/applications` and `/api/postings`, which all require `authed`. A
  publication renders a member-supplied `url` on the public profile, so this
  was the cheapest route onto a public page. Now requires `authed` for every
  write method.
- 🟢 **Rate limits added** to `POST /api/profile` (20/h per IP — the only
  unauthenticated write on the site), `PATCH /api/profile` (300/h per user,
  a runaway-loop backstop, generous because the page saves per field),
  `POST /api/portfolio` (30/h), `/api/publications` (60/h),
  `/api/endorsements` mint (60/h) and `POST /api/r/[token]` (10/h per IP).
- 🔴 **The limiter is per-instance, not shared.** Same honest limitation as
  every other caller of `lib/rate-limit.ts`: serverless instances don't share
  memory, so this raises the cost of a farm rather than making one impossible.
  Upgrade path is a shared store (Upstash/Redis) behind the same signature.
- 🟡 **iGaming and pharma professionals get `noindex`, not a block.** A
  legitimate casino-industry marketer or a pharmacologist whose CV names a drug
  scores at `review` and quietly loses indexing. That is the accepted cost of
  the asymmetry above. `Profile.spamCleared` (migration 044, set from
  `/hq/spam`) is the remedy — it overrides the SCORE only, never the substance
  bar, because thinness is not a false positive.

### Second pass (same day) — the remaining gaps, closed
- 🟢 **Disposable-email blocklist** (`lib/email-domains.ts`). Deliberately
  narrow and curated: public blocklists run to 100k+ domains and sweep up real
  providers, and blocking a real job seeker is worse here than admitting a
  throwaway. Apple Hide-My-Email, SimpleLogin, DuckDuckGo and Firefox Relay are
  deliberately ABSENT — an alias is not a throwaway, and blocking them punishes
  privacy-minded users. Enforced server-side in the index gate (a throwaway
  address never earns an indexed page); the check at signup is a courtesy that
  fails fast and is trivially bypassed, which it does not pretend otherwise.
- 🟢 **Portfolio indexing + sitemap gated too** (`lib/portfolio/indexing.ts`).
  Published work was in `sitemap.xml` and indexed with no score check. Both the
  page's `generateMetadata` and `app/sitemap.ts` now call ONE function, so the
  sitemap can't advertise a URL the page then refuses to index — Search Console
  reports that contradiction as an error.
- 🟢 **Migration 044 applied by hand** — `Profile.spamCleared` + `ContentReport`.
  Additive and idempotent only.
- 🔴 **`prisma migrate diff` tried to delete the embeddings.** The generated
  script for this change contained `ALTER TABLE "Profile" DROP COLUMN
  "embedding"`, because pgvector is commented out in `schema.prisma` and the
  differ reads it as drift — running it would have destroyed the matcher's core
  data, plus dropped array defaults and re-added existing foreign keys.
  Generated SQL here is **a suggestion to read, never a script to run.**
  Verified before and after: 8/8 profiles still hold embeddings.
- 🟢 **Member-facing report control** (`app/_components/ReportButton.tsx`) on
  public profiles and portfolio pages, plus `POST /api/report` (10/h per IP).
  Verified end-to-end in the browser: row written, surfaced in the queue,
  resolved, then the test row deleted by exact note match.
- 🔴 **A report is a SIGNAL, never an action.** Filing one hides nothing and
  changes no score. Auto-hiding on N reports would turn the button into a way
  to take a stranger's profile down, which on a site about people's careers is
  a worse failure than the spam it would catch. The UI says so in as many words.
- 🟡 **Reports are open to signed-out visitors, and no IP is stored.** The
  person best placed to notice an impersonation is the one being impersonated,
  who has no account here. The unique index is `(kind, targetId,
  reporterUserId)` and NULLs are distinct in Postgres, so anonymous reports are
  bounded by the rate limit rather than by the index — intended, not an
  oversight.
- 🟢 **`/hq/spam` review queue.** Shows the score AND the reasons, because a
  queue that only says "suspicious" trains a reviewer to rubber-stamp it.
  Actions: clear (re-index), hide, back-to-draft, resolve report. There is
  deliberately **no delete-member** action. Verified: unauthenticated GET and
  PATCH both 401; the unauthenticated page serves the login form with zero
  queue markup (only `<title>` matches, same as `/hq/posts`).
- 🟡 **The queue scores at read time and is capped at 500 rows of each kind.**
  There is no stored score — changing a threshold in `lib/ugc.ts` re-decides
  every page immediately rather than leaving numbers computed under dead rules.
  The cap is REPORTED in the response and shown in the UI, so "queue is empty"
  can never quietly mean "we only looked at the newest few hundred". When it
  starts to bite, the fix is a stored score written at the end of the ingestion
  run, same shape as PageStats.
- 🟢 **Turnstile wired into BOTH signup forms** (`/login` and `/r/[token]`),
  using Supabase's own captcha support rather than proxying auth through our
  own route. **Inert until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set** — no
  script loads, no token is sent, nothing changes. Verified: 0 Cloudflare
  script tags on the rendered pages today.
- 🔴 **The two halves must be switched on in the right order.** Enabling
  captcha in Supabase Auth WITHOUT setting the site key breaks every signup and
  sign-in, because Supabase would demand a token nothing is producing. Set the
  key, deploy, THEN enable it in Supabase. Both forms send the token because
  the setting is project-wide — the `/r/[token]` one is easy to forget and
  would silently break every endorsement.
- 🟢 **`scripts/rescore-ugc.ts`** re-scores all existing content against the
  current rules. Read-only on purpose: retroactively un-publishing someone's
  work because a threshold moved is not a thing to do from a script. Run it
  after ANY change to `lib/ugc.ts`. Current result: 14 items scanned, 0 at or
  above the review bar.
- 🔴 **Still NOT built:** no CAPTCHA on `POST /api/profile` — that is the
  anonymous onboarding path and the "no signup wall" promise on the jobs pages,
  so it keeps its rate limit and its `noindex` instead of a challenge; no
  appeal path for a member whose page was hidden (they are not told, and there
  is no form — today the remedy is emailing a human); no automated re-scoring
  on a schedule.

## Route loading indicator
- 🟢 **Navigation progress bar added 2026-07-30** (`app/_components/RouteProgress.tsx`,
  mounted in the root layout). The App Router shows nothing during a
  client-side navigation unless the target segment has a `loading.tsx`, so
  clicking a heavy page looked like a dead click.
- 🔴 **DO NOT "fix" this with `app/jobs/[slug]/loading.tsx`.** That is the
  obvious move and it breaks the SEO lattice: a `loading.tsx` wraps the segment
  in Suspense, Next commits HTTP 200 before the page resolves, and every
  `notFound()` after that renders a 404 body under a 200 — a soft 404 that
  Google indexes as a real page. Already measured once; see the comment block in
  `app/_components/RouteLoading.tsx` for the forbidden segments.
- 🟢 **The bar sidesteps that by living outside the routing tree** — a sibling of
  `{children}`, no Suspense boundary, client-only, so it cannot affect a status
  code. Verified after mounting: `/jobs/not-a-real-role`,
  `/jobs/graphic-designer/zz`, `/portfolio/does-not-exist` and `/p/nobody-here`
  all still return **404**.
- 🟡 **It deliberately avoids `useSearchParams`.** In Next 14 an unwrapped
  `useSearchParams` forces a CSR bailout for statically rendered pages, and this
  sits in the ROOT layout — it would opt the whole site out of static rendering
  to draw a progress bar. Keyed on `usePathname` only, so a navigation that
  changes only the query string won't animate.
- 🟡 **In-app navigations only.** A cold hit from Google shows the browser's own
  loading UI and nothing here helps; the lever there is TTFB.

## Portfolio publish staleness
- 🟢 **FIXED 2026-07-30: a published piece kept showing "This is a draft".**
  Nothing was wrong with the data or the server. `football-ad-campaign` was
  `PUBLISHED` in the database, the page is `force-dynamic`, and the banner
  condition (`isOwner && status !== "PUBLISHED"`) is correct — verified by
  fetching it anonymously: 200 with no banner in the HTML, while a real draft
  404s for non-owners.
  - The cause is the App Router's **client-side Router Cache**, which holds the
    RSC payload of an already-visited route. The draft page is visited on the
    way into the editor, so `router.push()` back to it after publishing replayed
    that cached payload, banner and all. `export const dynamic = "force-dynamic"`
    does NOT help — it governs server rendering and says nothing about the
    client cache. That mismatch is the trap; check the client cache before
    concluding the server is at fault.
  - Fixed on both sides: `revalidatePath` in `POST`/`PATCH`/`DELETE`
    `/api/portfolio` (server-authoritative, so a second tab or another device
    also gets a fresh page) plus `router.refresh()` before the push in the
    editor, for the navigation already in flight.
- 🟡 **Unverified locally**: exercising it needs a signed-in session, so the fix
  is reasoned from the mechanism and the server-side proof above, not from a
  reproduced publish. If the banner survives this deploy, a hard reload will
  distinguish a stale tab from a live bug — and it would mean the diagnosis is
  wrong, not merely incomplete.
- 🟡 **Same shape elsewhere, deliberately NOT patched.** `/profile` also does
  `router.push()` after a save, but its view is a client component that
  re-fetches `/api/profile` on mount, so the Router Cache never serves it stale
  and `router.refresh()` would be a no-op there.

## Publication cover thumbnails
- 🟢 **BUILT 2026-07-30** (migration 042): `Publication.imagePath`, a `publications`
  storage bucket, `POST/DELETE /api/publications/image`, and an image-left /
  text-right layout on both the owner's panel and the public profile. Follows
  the existing pattern exactly (`lib/portfolio/storage.ts`,
  `app/api/company/logo/route.ts`): the DB stores the PATH not a URL, the type
  comes from sniffing magic bytes, the path is chosen server-side, and uploads
  go through the service role because the bucket grants clients no write policy.
- 🟠 **The upload round-trip is UNVERIFIED locally** — `SUPABASE_SERVICE_ROLE_KEY`
  is not in the local `.env`, so `createAdminClient()` returns null and the route
  answers "Uploads aren't configured on this environment". This is not specific
  to publications: portfolio and logo uploads are equally untestable locally. The
  key is evidently set in Vercel (portfolio images exist in production), but the
  first real publication upload in prod is the actual test. What WAS verified:
  the rendering path, by setting `imagePath` on a row and confirming the public
  profile emits the right bucket URL with the cover left of the text (74×99 at
  x=101, text column at x=188, same flex row) — then restoring the row to null.
- 🟡 **A cover can only be added to a SAVED publication.** The upload targets an
  existing row id, so the control lives on the list item, not inside the add
  form. That keeps the storage path derived from real ownership instead of
  inventing a pre-save id.
- 🟡 **Deleting a publication removes its object; deleting an ACCOUNT does not.**
  `DELETE /api/publications` reads `imagePath` before the row goes and cleans up
  after. Account deletion cleans no bucket at all — pre-existing and true for
  portfolio and logos too, not something this feature introduced. Worth one
  sweep across all four buckets if it ever matters.

## Recommendations vs. reviews
- 🟢 **Split into two sections (2026-07-30).** They were one card titled
  "Recommendations & reviews", so a reader had to infer which was which from a
  trailing "on <project>" label. They are different claims about different
  objects: a **recommendation** is about the person and belongs to the profile;
  a **review** is about one piece of work and belongs to that portfolio piece.
  The data model already separated them (`EndorsementKind`) — only the UI
  conflated them.
  - Owner's profile: two cards, "Recommendations" and "Reviews of my work".
    `EndorsementsPanel` now takes a `kind` prop and owns one half, so the
    request form no longer needs its RECOMMENDATION/REVIEW toggle.
  - Public profile: recommendations render plainly; reviews are **grouped by the
    work they are about**, each group linking to that piece's page — which
    already renders the same reviews (`app/portfolio/[slug]/page.tsx`).
- 🟡 **Two independent visibility switches now.** `hiddenSections` gained
  `"reviews"`; the legacy `"endorsements"` key keeps its name and now hides
  recommendations only. Safe at the time of the change because **no profile had
  any hidden section** (verified: 0 of 8). If that had not been true, splitting
  one switch into two would have silently exposed reviews someone had hidden.
- 🟡 **Live data is all REVIEWs** (2 submitted, 1 pending invite; 0
  recommendations), so the Recommendations card is currently empty everywhere
  and the public one is absent by design. The empty-state copy is the only thing
  most members will see there until recommendations get requested.

## Structured data (JobPosting)
- 🟢 **Search Console "Missing field applicantLocationRequirements" FIXED
  (2026-07-30).** Google treats a `TELECOMMUTE` posting without that field as an
  *invalid item*, not an incomplete one. GSC showed 1 item because it had only
  validated a fraction; the real exposure was ~3,000 remote listings. Three
  separate defects, all now closed:
  - **The hub-page `ItemList` was a hand-rolled second copy** of the JobPosting
    shape in `SeoPageView`, and it had drifted: it never emitted
    `applicantLocationRequirements` at all, and built an empty `PostalAddress`
    for remote rows — the exact thing `job-posting-ld.ts` carries a comment
    warning against. It now calls `jobPostingLd()`. **Don't re-fork it.**
  - **Region scopes were emitted as countries.** `remoteScope` also holds
    `EMEA`/`EUROPE`/`NORTH_AMERICA`/`APAC` (29 live rows), which went out as
    `{"@type":"Country","name":"NORTH_AMERICA"}`. Scope values are now only used
    when they're a real ISO-2 code in `COUNTRY_NAMES`.
  - **`remoteScope = "GLOBAL"` produced TELECOMMUTE with no requirement** (13
    live JOB rows). Google's vocabulary has no "worldwide" value — verified
    against its JobPosting docs — and requires at least one real country.
- 🟡 **`jobPostingLd` now returns `null`, and the caller must emit nothing.** A
  posting we can't make valid produces no markup at all. This costs no traffic:
  an invalid item generates no rich result anyway, so the broken version only
  ever bought a Search Console error. Same principle as the rest of that file —
  describe what we hold, never invent the rest.
- 🟡 **~13 genuinely-worldwide remote jobs get no JobPosting markup**, and so no
  Google Jobs eligibility. The alternative is naming a country that isn't the
  real requirement. If we ever want them eligible, the honest fix is capturing
  the actual eligible countries at ingestion, not picking one.
- 🟡 **Freelance projects never emit JobPosting** — the guard moved from the
  detail page into `jobPostingLd` (keyed off `kind`), so no future caller can
  reintroduce it. Google's policy covers employment, not bid work.
- **Verified before/after** on live data, per shape: REMOTE_US → valid with
  `Country: US`; ISO-2 scope → valid with that country; `GLOBAL` → no markup;
  `EMEA` → no markup; ONSITE → valid via `jobLocation`; PROJECT → no markup.
  Across hub pages: 0 invalid items, 0 empty addresses, and
  `/jobs/remote-backend-engineer` emits 25/25 valid postings.

## Performance
- 🟢 **The `/jobs` 3-second load is FIXED (2026-07-30).** Root cause was one query,
  not the page: `hubMatchIds` ran a case-insensitive regex over `descriptionRaw`
  for **every** LIVE row — 14.5k full HTML descriptions through a regex engine at
  **1,173ms of DB execution**, when every other query on the page measures 3–8ms.
  Three compounding fixes:
  - The SQL now narrows on cheap title regexes in a `MATERIALIZED` CTE and only
    regexes descriptions for the survivors + the ~900 projects: **1,173ms → 246ms**,
    verified byte-identical (166 rows, same ids, same order). `MATERIALIZED` is
    load-bearing — without it the planner inlines the CTE and reverts to the slow
    plan.
  - `getBrowseHub` is now memoised per request with React `cache()`. `/jobs` called
    it **twice** — once in `generateMetadata`, once in the page body — and nothing
    deduped Prisma calls, so the page paid the whole cost twice.
  - `unstable_cache` with a 900s TTL on top, because this data is read by `/jobs`,
    `/`, `/about` **and every SEO page** via `SeoPageView`, and only changes when
    ingestion runs (twice a day). Warm `/jobs` measured at 33–52ms.
- 🟡 **Hub-count staleness is bounded at 15 minutes.** The ingestion cron runs
  outside Next, so it can't call `revalidateTag("browse-hub")`. If counts ever need
  to be exact-on-ingest, add a revalidation webhook at the end of the ingest job —
  the tag is already there.
- 🟡 **The DB error path is deliberately NOT cached.** `computeBrowseHub` throws;
  the catch that degrades to an empty hub lives outside `unstable_cache`, so a
  transient blip can't pin an empty directory for the whole TTL. Keep it that way.
- 🟢 **SEO listing pages were shipping their job descriptions to the browser
  (fixed 2026-07-30).** `JobsInteractive` is a client component, so every field
  on the rows handed to it is serialised into the RSC payload — including
  `descriptionRaw`, ~4KB of HTML per job, for 150 jobs, which no card ever
  reads. `/jobs/tech-software` was **1,888KB uncompressed → 363KB** (5.2x), and
  the DB was never the problem: every query on that page measures 5-7ms and the
  PageStats lookup is 0ms. The client now receives `CardJob`
  (`Omit<SeoJob, "descriptionRaw">`); the JSON-LD still gets full descriptions
  because it is built server-side before the narrowing. **Watch this whenever a
  server component passes DB rows to a client one — the payload is invisible
  until you measure it.**
- 🟡 **`/jobs/{role}` pages still fan out ~26 queries** (`buildListing`: a company
  groupBy plus one findMany per top company). Each is single-digit ms on Vercel, so
  it's fine today, but it's the next hotspot if page latency regresses — and it is
  what makes those pages slow to test from a non-colocated machine.
- 🟡 **Don't "optimise" the median-age query into `percentile_cont`.** Measured:
  the current `take: 4000` findMany is 3ms DB-side, the SQL percentile is 32ms.
  The obvious refactor is 10× worse.

## Billing, employer & content (added 2026-07-30 — shipped after this file's last pass)

These three areas shipped between 2026-07-18 and 2026-07-30 and had no entries
here at all, which is exactly the drift the kickoff doc's §2 convention 1 exists
to prevent. Entries below are code-verified; live-behaviour claims are marked.

- 🟢 **Stripe billing BUILT** (migration 036): `lib/billing/stripe.ts`,
  `/api/billing/{checkout,portal,webhook}`, `/pricing`, pinned to API version
  `2026-06-24.dahlia`. Every path is gated on `billingConfigured()` — until
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PREMIUM_PRICE_ID` are
  all present the feature is inert rather than half-live.
- 🟠 **Stripe keys are not in local `.env`**, so billing is inert in local dev.
  Whatever is set in Vercel is the source of truth; the keys are the founder's to
  manage and aren't in the repo.
- 🟡 **One profile currently has `tier=PREMIUM` and a `stripeCustomerId`.** The
  repo can't tell whether that came from a real checkout or a manual set during
  testing — worth confirming before treating premium-tier behaviour as unexercised
  in production.
- 🟢 **Employer dashboard BUILT** (migration 040): `lib/employer/{publish,stats,
  sourcing}.ts`, `/api/employer/{dashboard,sourced}`, `/employer` + `/employer/new`
  + `/employer/[id]`. Native postings and a company record exist (1 company, 1
  native job live).
- 🟡 **Employer view/click stats read near zero, correctly.** `JobView`/`JobClick`
  only started collecting recently and there's exactly 1 native posting, so the
  dashboard is honest-but-empty rather than broken. Don't "fix" it by inventing
  baselines.
- 🟢 **Blog BUILT** (migration 039): `lib/blog/*` (slugify, TOC, reading time,
  SEO analysis, Supabase storage), `/blog`, `/blog/[slug]`, `/blog/tag/[tag]`,
  authoring at `/hq/posts`, and blog URLs ride in `sitemap.xml`. 2 posts published.
- 🟡 **`/hq` is the only admin surface.** The kickoff doc's old `/admin/waitlist`
  path no longer exists; waitlist stats are a tab inside the `/hq` dashboard.

## Slice 4 (spec §7–9)
- 🟢 **Programmatic SEO engine BUILT** (§7): `/jobs/{role|vertical}`,
  `/jobs/remote-{role}`, `/jobs/{role}/{state}`, `/jobs/{role|vertical}/{country}`,
  `sitemap.xml` (self-pruning), `robots.txt`, JobPosting JSON-LD, the
  role↔state↔remote↔country internal-link lattice, and absolute canonicals.
  Verified 2026-07-30: **456 URLs in the live sitemap**, 34 roles with live jobs.
- 🟢 **Thin pages are `noindex,follow`, NOT 404 — changed 2026-07-30.** Previously
  a page below the floor 404'd. Now only a URL with nothing behind it 404s (no
  taxonomy match, or a taxonomy match with zero live listings); a real taxonomy
  page that's merely thin renders with `noindex,follow` and a "few listings right
  now — set an alert" state. Per `docs/topezia-slice4-seo-spec.md` §1.2, and the
  reasoning matters: a 404 tells Google to drop the URL, so re-earning its ranking
  later starts from zero, and listing counts on a jobs site oscillate — a
  role × city page dips below the floor one week and recovers the next. 404ing on
  every dip churns the index footprint, and converts a visitor into a bounce
  instead of an email signup.
  - Floors are now per kind: role 5, role|vertical × place 3, remote-role 3,
    vertical 1 (verticals aggregate roles), place/hub 5. See
    `MIN_JOBS_FOR_*` in `lib/seo/pages.ts`.
  - The floors still govern **linking**: sitemap, sibling lattice and job
    breadcrumbs all check them, so nothing links to a noindex page. Verified by
    audit: `/jobs/graphic-designer` (4 jobs) is `noindex,follow` and absent from
    the sitemap, while 23 of 23 `/jobs/*` links crawled from an indexable page
    resolved to `index,follow`.
  - Thin pages emit **BreadcrumbList only** — no CollectionPage/ItemList/FAQPage.
    Asking for rich results on a page we've told Google to skip is a mixed signal.
- 🟢 **`NEXT_PUBLIC_SITE_URL` is correct in Vercel** — verified: the live sitemap
  and robots.txt both emit `https://www.topezia.com`, the canonical host.
- 🟡 **Page volume is still gated on job volume, not code** — but the "only 3 SEO
  pages" era is over: 456 sitemap URLs as of 2026-07-30, against a launch target
  of 2–4k. Two things follow, and neither is a bug: a hand-typed `/jobs/*` URL
  outside the taxonomy still 404s, and one inside the taxonomy but under its floor
  renders `noindex` with the alert state rather than 404ing (see above). Anything
  that *links* to a below-floor page is still a real bug.
- 🟢 **LLM page intros BUILT** (§7): `SeoPageIntro` cache (migration 008),
  `scripts/generate-page-intros.ts` (`npm run gen-intros`, `--dry-run/--force`),
  refreshed weekly by `page-intros-cron`. Copy is generated **out of band** — a
  page with no cached intro renders the templated fallback and never blocks on
  the model. The prompt is fed real counts/titles/companies and told not to
  invent facts; the intro also feeds each page's `<meta description>`, so search
  snippets are unique too. (Verified live on all 4 publishable pages when written
  on 2026-07-18; there are 456 publishable pages now, and the cron backfills them
  out of band — a page without a cached intro still renders the fallback.)
- 🟢 **Email alerts BUILT** (§7 capture + §9 delivery): above-the-fold capture on
  every SEO page, `POST /api/alerts` (resolves the saved search server-side —
  never trusts client-sent ids; idempotent per email+search), `JobAlert` table
  (migrations 006/007), and `scripts/send-alerts.ts` (Resend, `--dry-run`).
  Sends nothing when there's nothing new — an empty digest trains people to
  ignore you. Deliverability built in:
  - **Double opt-in** — nothing is ever mailed to an address that hasn't clicked
    the confirmation link (typos/spam-traps bounce → reputation damage; also the
    honest consent bar).
  - **RFC 8058 one-click unsubscribe** — `List-Unsubscribe` +
    `List-Unsubscribe-Post` headers, which Gmail/Yahoo have required of bulk
    senders since Feb 2024, plus a no-confirm-step unsubscribe link.
  - **Subdomain sending** (`alerts@mail.topezia.com`) to isolate reputation.
  Verified end-to-end without sending a real email: subscribe → sender sends
  nothing while unconfirmed → confirm → sender sends → one-click POST
  unsubscribe → sender sends nothing again.
- 🟡 **Freshness not enforced on display.** Spec §4.4 says never show anything
  unverified >48h; neither the feed nor SEO pages filter on `lastVerifiedAt`
  (they'd empty out without the ingestion cron running). Wire this up when the
  cron is turned on at launch.
- 🔴 **Alerts can't send until `mail.topezia.com` is verified in Resend.**
  Confirmed by Resend itself: `403 — The mail.topezia.com domain is not
  verified`. Add the domain at https://resend.com/domains and publish the DNS
  records it gives you. We deliberately send from a **subdomain**, not the root,
  so bulk-alert reputation can't poison `topezia.com` (used for human mail).
  Until it's verified the alert form fails honestly ("couldn't send the
  confirmation") rather than pretending — the pending row survives for retry.
- 🟠 **Warm up the new sending subdomain.** It has zero reputation; blasting a
  large first batch is itself a spam signal. Ramp volume gradually.
- 🟠 **Add a DMARC record** for the root domain (start `p=none`, monitor, then
  tighten). SPF/DKIM alone isn't the whole picture.
- 🟢 **Cron workflows landed** (`.github/workflows/`): ingest 02:00+14:00 UTC,
  expiry 03:30, alerts 15:00 — each with `workflow_dispatch` and a concurrency
  group so runs can't overlap or double-send. This unblocks the kickoff doc's
  long-standing "workflow files were never successfully pushed" item (the old
  PAT lacked `workflow` scope; SSH isn't scope-restricted).
- 🟢 **Repo secrets added and the cron path is PROVEN.** A manual `Ingest jobs`
  run (cap 2/source) crawled all 4 sources from GitHub Actions — reaching the US
  DB and resolving both the Anthropic and Voyage keys from secrets (39 → 43
  jobs). Scheduled runs will work unattended.
- 🟢 **`RESEND_API_KEY` / `ALERT_FROM_EMAIL` are live on Vercel and PROVEN.** A
  real POST to `/api/alerts` on www.topezia.com returned `200 {ok, pending:true}`,
  which the route only returns after Resend accepts the confirmation email — so
  the keys resolve in production and the live signup form genuinely works.
- 🟡 **The double opt-in CONFIRM step hasn't been exercised in production.** The
  send half is proven (above); clicking the emailed confirm link — which flips
  the pending row to active — has only ever been tested locally.
- 🟡 CPC-feed monetization (Talent.com / Jooble / Appcast) + affiliate slots —
  not started; needs external feed accounts.
- 🟢 **Résumé parse now extracts proficiency, industries and location.** Skills
  carry BOTH `confidence` (did the résumé say it?) and `proficiency` (are they
  any good at it?). These are deliberately independent and it works: a test
  résumé saying "touched Kubernetes once" parses as `confidence=1.0,
  proficiency=FAMILIAR` — clearly stated, barely used. The reranker sees the
  proficiency and treats "wants deep K8s" as a real gap.
- 🟡 **Proficiency is an LLM inference, not a fact.** It's read off years, role
  seniority and depth of description. It will sometimes be generous — the same
  test rated "Terraform for staging only, occasionally" as PROFICIENT when
  FAMILIAR was fairer. It nudges ranking only; nothing is filtered on it.
- 🟡 **`salaryTarget` is a scoring signal, never a filter.** `salaryFloor` still
  hard-filters. Nobody loses a match for aiming high — the target only lets the
  why-line say a range falls short.
- 🟡 **`workAuthorization` is captured but is NOT a hard filter, by design.** We
  do not extract sponsorship terms from postings, so filtering would mean
  hiding jobs on a guess. The reranker is instructed to mention sponsorship
  only when the posting itself raises it. If we ever parse sponsorship from
  descriptions, revisit this.
- 🟡 **"Locations you'd consider" is free text, not geocoded.** It's split on
  commas and passed through. The stage-1 hard filter still only uses remote
  type — a typo or "anywhere in California" won't narrow retrieval, it only
  informs the rerank. Real geo matching needs a location taxonomy.
- 🟡 **LinkedIn "connect" is still a PDF export, not an integration.** The
  onboard screen tells the user to use LinkedIn's own More → Save to PDF and
  upload it. There is no LinkedIn API auth — that needs a Partner-tier app.
- 🟢 **Job dedup now keys on identity, not content (migration 010).** Ingestion
  used to ask "have I seen this?" by hashing the NORMALIZED description, which
  made dedup a function of our own extraction code. When the Greenhouse
  entity-decoding fix changed how descriptions normalize, previously-ingested
  Greenhouse jobs hashed differently, looked new, and were inserted again — 4
  duplicate rows, 9% of the live feed, and the reranker noticed before we did
  ("Identical to job 33728f50" in a why-line). With cron ingesting twice daily,
  the next normalization change would have duplicated every affected source.
  Identity is now (source, sourceCompanySlug, externalId) — the source's own id
  — backed by a unique index, and a known posting whose text changed is UPDATED
  in place. Proven: an ingest that would have created 6 duplicates reported
  "Created: 0, Refreshed: 6" with the row count unchanged; a second run was
  fully idempotent (0 LLM calls); and a direct duplicate INSERT is rejected by
  the DB. Historical dupes cleared by `scripts/dedupe-identity.ts` (dry-run by
  default, `--apply` to act; reassigns JobClicks rather than dropping CPC
  attribution).
- 🟡 **Rows with a NULL externalId are not constrained** (Postgres treats NULLs
  as distinct). Every crawler sets externalId today and there are 0 NULLs live;
  ingestion falls back to matching on sourceUrl if one ever appears. A new
  crawler that omits externalId would silently lose this protection.
- 🟢 **Reranker was scoring every Greenhouse job on its title alone — FIXED.**
  `stripToSnippet` stripped HTML tags before decoding entities, and Greenhouse
  serves entity-encoded HTML, so its tags arrived as literal `&lt;h2&gt;` text
  the tag regex couldn't match. The reranker's whole 500-char window was markup
  noise (`&lt;h2 class=&quot;p1&quot;&gt;…`) with ZERO job content. Exactly the
  decode-before-strip trap already fixed in lib/sanitize.ts — the matching path
  was never fixed. Now decodes first; snippet raised 500→2000 chars since it's
  real prose now. Why-line quality is visibly different: the model now cites
  "Discord's Notifications team uses Elixir and Python—languages you don't
  list" where it used to say it couldn't assess the role.
- 🟢 **Why-lines are scrubbed deterministically (`cleanWhyLine`).** The reranker
  leaked internal job ids ("Identical to job 33728f50"), compared jobs against
  others in the same batch ("identical to the other PostHog role"), and
  complained our excerpt was truncated — all meaningless to someone reading one
  card. Prompt instructions alone did NOT hold: after adding them, 2 of 12
  why-lines still offended. The scrubber drops offending CLAUSES (keeping the
  useful half of the sentence) and is unit-tested against the real offenders.
  Verified live: 12 scored, 0 bad, 0 empty.
- 🟡 **Lesson: verify with tests that would actually fail.** My first check for
  id-leaks reported "0 leaking" because the regex only matched the literal
  "identical to" — it missed "Identical skill overlap to the other PostHog
  role" sitting in its own output. A passing test proved nothing.
- 🟡 **Cached why-lines from before this fix survive** until a profile's
  matchVersion changes (MatchScore is keyed on it). Existing profiles keep the
  old markup-blind scores until they re-save or the cache is cleared.
- 🟢 **Location→state parsing was substring-matching — FIXED.** `"Washington,
  D.C."` contained "washington" and resolved to **WA**, filing a real Palantir
  D.C. posting under Washington state — the wrong side of the country, on a
  feature whose whole point is local relevance. Same class of bug: "West
  Virginia" → VA (because "virginia" was tested first), "Kansas City, Missouri"
  → KS, "Delaware, Ohio" → DE. Now matches whole comma-components right-to-left
  instead of substrings, handles D.C. explicitly, and is unit-tested over 24
  cases including the non-US ones that must stay null. DC added to the SEO state
  map so /jobs/{role}/dc renders. Existing rows re-parsed: 2 corrected.
- 🟡 **Multi-location postings with an identical title+description collapse.**
  Ingestion's cross-source "byte-identical content" check keys on
  hash(title + description) with no location, so Palantir's "Administrative
  Business Partner" posted in several cities is treated as one job (1 of 4 was
  skipped as already-current this run). Fine for true cross-posting, wrong for
  a genuinely different location — someone in NY could miss the NY posting
  because we kept the London one. Include location in that hash.
- 🟢 **The feed no longer claims non-US jobs are US-eligible (migration 011).**
  The schema had no country at all — location was free text plus `locationState`
  (a US-only concept), and RemoteType offered only REMOTE_US/REMOTE_GLOBAL. So
  every remote job whose scope wasn't explicitly global fell through to
  REMOTE_US: **9 of 11 non-US jobs** (Poland, Mexico, Canada, EMEA, Ireland/UK)
  were labelled "Remote US" to US seekers. The US assumption was in the data
  model, not the filter. Now: Job.country (ISO-2), Job.remoteScope
  (GLOBAL/region/ISO-2), Profile.country (derived from the résumé), and a
  REMOTE_INTL type. Verified: a US seeker gets 12 matches with 0 non-US; a
  "North America" job still reaches them via region membership.
- 🟡 **Eligibility filtering is deliberately one-directional.** Unknown geography
  PASSES (17 of 42 live jobs have country=null, mostly bare "Remote"). Hiding a
  job because we failed to parse its location would be our bug punishing the
  seeker. Only positive evidence of a mismatch hides a job.
- 🟢 **Global sources added — 5 → 13 boards, ~1,242 crawlable jobs.** Monzo, N26,
  Wolt (28 countries alone), Deliveroo, Xero, Wealthsimple, Meesho, Qonto. All
  verified with the real crawlers before seeding (leverdemo lesson): 0 missing
  fields, 0 "(copy)"/demo titles, unique externalIds. Modelled against the SEO
  floor: **31 countries would now clear 5 live jobs, up from 1 (US only)** —
  US=300 GB=205 DE=85 CA=56 FR=54 ES=52 IN=42 AU=34 GR=29 AE=25 … 14 more
  countries sit below the floor and correctly get no page.
- 🟡 **The sources are seeded but NOT yet ingested** — deliberately, per the
  standing rule that job data is perishable (§4.4) and a pre-launch crawl just
  expires. Cron picks them up. Nothing is in the feed from these boards yet.
- 🟡 **Unstated-scope remote still defaults to REMOTE_US** — a documented guess,
  not a fabrication about a known place. remoteScope stays null so it can be
  revisited (e.g. infer from the board's own country).
- 🟡 **"Global" in prose ≠ global eligibility.** Scanning descriptions for
  "global" turned a bare "Remote" into REMOTE_GLOBAL, because postings say
  "a global leader" constantly. Scope is now read from the LOCATION field only,
  plus explicit phrases like "work from anywhere". My first unit test missed
  this by passing an empty description — test with realistic prose.
- 🟡 **SEO is still US-state-only.** /jobs/{role}/{state} has no country
  equivalent, so non-US jobs are invisible to SEO. Country pages are the next
  chunk if global matters for acquisition.
- 🟡 **The country dictionary is hand-maintained (~90 countries).** It started
  US/Europe-centric and missed Pakistan — which is where our own test profile
  lives. An unlisted country silently becomes null (permissive, so it shows
  everything rather than nothing). Consider a real ISO-3166 library.
- 🟢 **Voyage is on a paid tier — the 3 RPM cap is GONE (verified 2026-07-17:
  6 concurrent calls, 0 rate-limited).** Backfill default dropped 21,000ms →
  250ms in both the script and the workflow. This mattered before the next
  scheduled backfill: at the old default the ~1,100 jobs from a full crawl would
  have taken days. All 139 live jobs embedded; **100% retrievable by the
  matcher**, up from 46%.
- 🟢 **Location parsing rebuilt for the world: 25% → 2% unresolved** over 2,474
  real location strings from 14 non-US boards. Global boards name a CITY, not a
  country ("Berlin", "London - The River Building HQ", "AU - Sydney",
  "Bangalore, Karnataka"), and country names alone resolved only 75% — the rest
  would have landed in the "unknown" bucket, which PASSES the feed filter, so
  Berlin jobs would have quietly reached Texans anyway. Now: ~200 world cities +
  bare US city names, matched after US states so "Paris, TX" is still Texas and
  "Manchester, NH" is still New Hampshire. 15 collision traps unit-tested.
- 🟡 **City/country dictionaries are hand-maintained.** ~200 cities, ~95
  countries. An unlisted place silently becomes null → permissive (shows to
  everyone) rather than hidden. 7% of crawlable jobs still have no country. A
  real geocoding library is the durable answer.
- 🟢 **Country SEO pages live: /jobs/{role|vertical}/{country}.** Full-name slugs
  ("germany", "united-kingdom"), NOT ISO codes — codes cannot share the {place}
  namespace with US states: CA is California AND Canada, IN Indiana AND India,
  DE Delaware AND Germany, GA Georgia twice. States resolve first, so every
  existing US page is byte-identical. Same ≥5 floor, same auto publish/unpublish,
  same sitemap. First two published on 22 ingested Monzo jobs:
  /jobs/finance-accounting/united-kingdom (9) and /jobs/tech-software/united-kingdom (6).
- 🔴 **CORRECTION to the "31 countries clear the floor" figure.** That was
  COUNTRY-LEVEL totals; pages are role×country, which is far sparser — 19 UK jobs
  spread across 5 distinct roles clears nothing. Hence vertical×country pages
  (broader, publish immediately: finance-accounting GB=9, tech-software GB=6).
  Expect country pages to be dominated by VERTICAL pages until per-country volume
  is ~10-20x higher; role×country will stay thin for most countries.
- 🟡 **Alerts are now country-scoped (migration 012).** Without it, subscribing on
  "Backend Engineer jobs in Germany" fell through to the plain role and would
  have emailed backend jobs worldwide — a page promising Germany, delivering
  Texas and Bangalore. queryKey now includes country, so a Germany alert and a
  global one stay distinct for the same address. Verified: 3/3 distinct keys.
- 🟡 **vertical×STATE pages are now reachable too** (/jobs/tech-software/ca), a
  side effect of supporting vertical×place. Additive and floor-gated — existing
  US pages are unchanged — but it is a new US surface that was not there before.
- 🟢 **Ingest is ~5.5x faster: 17.8s/job → 2.3s/job** (same board, same 8 jobs,
  embeddings deferred). Jobs are independent, so a fixed-size worker pool
  (`--concurrency=N`, default 4) processes several per board at once.
- 🔴 **CORRECTION: the "8 hours per crawl" figure was measured wrong.** It came
  from a laptop in Pakistan hitting a US-east database, where a bare `SELECT 1`
  takes **2,780ms**. Nothing was unbatched — `resolveSkillsMap` already does ~5
  queries, and 5 × ~1.1s round-trips IS the 5.5s. Production runs on a US
  GitHub runner (~10-20ms/round-trip), so the per-job cost there is the LLM
  call, not the DB. **Measure ingest speed on the runner, never locally.**
- 🟡 **Embeddings are now decoupled from ingestion (`--skip-embeddings`).** Voyage
  free tier is 3 RPM and embed.ts backs off 20-40s on a 429, so inline
  embeddings make every concurrent worker sit blocked and concurrency buys
  nothing. Ingest ships jobs LIVE without embeddings; scripts/backfill-embeddings.ts
  (throttled, resumable) fills them in. Jobs without an embedding still appear —
  the matcher falls back to recency — but they won't rank well until backfilled.
- 🔴 **Concurrency exposed a dedup race that DELETED jobs — fixed.** `pickSurvivor`
  broke ties by argument order and callers pass themselves first, so two
  equal-priority rows each concluded "I win, demote the other". Run sequentially
  it was invisible; run concurrently both demoted each other and the posting had
  **no LIVE row at all** — it vanished from the feed. Reproduced live (two N26
  "Backend Engineer – Core Systems" rows, both DUPLICATE, pointing at each
  other). Now tie-breaks on id, so the verdict is identical whichever side asks;
  the demote is also guarded on status=LIVE. Verified: exactly one survivor.
- 🟢 **Cron now uses the fast path.** `Ingest jobs` passes `--concurrency=8
  --skip-embeddings` by default (scheduled runs included), with dispatch inputs
  for concurrency, `--only=<slugs>`, a per-source cap, and an `inline_embeddings`
  escape hatch. Without this the schedule would have embedded inline and stalled
  on Voyage's 3 RPM inside a 60-minute budget. New `Backfill embeddings`
  workflow (04/10/16/22 UTC, 55-min budget, resumable) gives those jobs their
  vectors afterwards. All 5 workflow files YAML-linted.
- 🟡 **Jobs are LIVE before they are embedded** — still the deliberate trade
  (ingest stays fast, embeddings follow), but on the paid tier the gap is
  minutes rather than days. Jobs without an embedding are invisible to stage-1
  retrieval, so they appear in the feed but cannot be matched until backfilled.
- 🟢 **Full unattended crawl PROVEN on the runner: 1,135 live jobs in 5m 58s.**
  The scheduled 14:00 UTC run fired (late — see below), crawled all 13 boards,
  and landed 139 → 1,135 LIVE across 45 countries, well inside the 60-min cron
  budget. 99 duplicates, 0 orphaned — the dedup-race fix held at 1,200-job scale.
  The programmatic SEO lattice auto-published 50 country pages (was 2).
- 🟡 **GitHub cron fires LATE and unreliably.** The 14:00 UTC scheduled run
  actually started ~14:46. Runs can be delayed 30-45 min or dropped under load —
  do NOT treat the cron time as a deadline. A watcher that polled until 14:50
  concluded (wrongly) that it never ran; it finished ~14:52. For anything
  time-critical, trigger manually or widen the watch window well past the hour.
- 🔴 **The inventory gap is now concrete, and it is the owner's own profile.**
  A seeker in Islamabad (a real profile in the DB) gets **3 matches, scored
  8-18** — the geography filter is correct, there is simply nothing there. India
  jobs (meesho, 42) do NOT qualify a Pakistan-based seeker: different country,
  and we don't pretend otherwise. Every source is a US/EU/AU/IN board. Global
  coverage still needs sources per market; the filter and the pages are ready
  for them.
- 🟡 **Backfill was ~4s/job locally** (75 jobs in 5 min) — that is DB write
  latency from Pakistan, not Voyage (which answered in ~850ms concurrently).
  Expect it far faster on the runner. Same lesson as ingest: time it there.
- 🟢 **/jobs was a 404 — now the browse hub.** Only /jobs/{slug} and deeper
  existed, so the bare /jobs directory 404'd (owner hit it). Now a hub grouping
  every publishable page: by field, role, country (30), and US state (8), each
  with a live count, floor-gated so it never links to a page that would 404.
  Added single-segment place pages (/jobs/germany, /jobs/california) as the hub
  targets — full-name slugs, so "canada" and "california" don't collide the way
  the 2-letter codes would. Browser-verified: hub → Germany chip → "Jobs in
  Germany" (77), no console errors. In sitemap at priority 0.9.- 🟢 **Editable profile page shipped (/profile, Panel 1).** Until now the ONLY
  way to change a profile was re-uploading a résumé — now every structured field
  is editable in place, and each carries a provenance badge (from your résumé /
  we inferred / you added), derived from the skill source + confidence we
  already store. Saving bumps matchVersion (cache invalidated) and re-embeds
  when headline/skills change. Hand-edits preserve a skill's original source —
  a résumé skill stays "from your résumé" after you tweak its level. New
  MemberTier flag (migration 013) stubs the roadmap paywall; nothing reads it
  yet, everyone is FREE. Verified in-browser end to end: Kubernetes → familiar
  persisted with RESUME provenance intact and matchVersion bumped.
- 🟢 **Settings + data control shipped (/settings).** Export data (JSON
  download), delete stored résumé text, unsubscribe alerts, delete account.
  Delete-account deletes the non-cascading signals (JobClick/JobSave/
  JobDismissal) explicitly in a transaction before the profile — a naive
  profile.delete() would FK-error for any user who's clicked a job. Verified:
  résumé-text delete cleared the text and kept the profile; account delete on a
  throwaway profile with all child types removed everything cleanly.
- 🟢 **Real account deletion wired (needs one env var to fully activate).**
  DELETE /api/account now calls Supabase admin.deleteUser for signed-in users
  via a server-only admin client (lib/supabase/admin.ts), then signs them out.
  It degrades gracefully: if SUPABASE_SERVICE_ROLE_KEY isn't set it still
  deletes ALL profile data and reports authUserDeleted:false. **ACTION: add
  SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API → service_role) to .env
  and Vercel** so the login itself is removed, not just the data. The key is
  server-only — never NEXT_PUBLIC.
- 🟢 **Logout + password reset shipped.** Sign-out button in /settings for
  authed users; "Forgot password?" on /login → resetPasswordForEmail → /reset
  page that sets a new password from the recovery session. Verified in-browser:
  /reset guards a stale/direct visit ("link invalid or expired"), the
  forgot-password link shows only in login mode, and triggering it returns the
  success notice (resetPasswordForEmail resolved with no error).
- 🟡 **Two authed flows are build-verified but NOT exercised end-to-end** — the
  sign-out button and real auth-user deletion both need a live signed-in
  session, which requires creating an account / entering a password (something
  the assistant can't do). Owner should click through both once after adding
  the service-role key. The password-reset SEND path is verified; clicking the
  emailed link → new password is not (needs a real inbox).- 🟢 **Panels 3 + 4 shipped: honesty mirror + roadmap on /profile.** Both are
  pure corpus-diffs (lib/matching/insights.ts) — every number counted from live
  postings in the user's field that they could actually take (country-eligible).
  Mirror: skill coverage %, seniority fit (at/above vs below your level), the
  single most-wanted skill you lack. Roadmap: ranked skill gaps + certs named in
  postings, first two free (the diagnosis), the rest tagged premium (tier flag,
  everyone FREE now). Verified in-browser on the backend persona: 14% coverage,
  20 roles at/above Lead, TypeScript wanted in 34%, Kubernetes shown as
  "familiar → advanced" (proficiency-aware), CKA in 41 postings.
- 🔴 **We deliberately did NOT build the salary-anchored roadmap.** Only ~6% of
  live postings (73 of 1,135) carry salary, and years-of-experience isn't
  extracted at all — so "$180k target, jobs ask X, average 11 years" from the
  mockup would have been fabricated. The roadmap anchors on skills/seniority/
  certs instead (100% / 100% / description-text coverage). If a real salary
  data source lands, add that lens then — do not fake it.
- 🟡 **Insights scope to ROLE when it has ≥20 eligible jobs, else the vertical
  (labelled "broad").** A US backend engineer has <20 US-eligible backend
  postings (most are in Europe), so their mirror widens to "tech & software
  (broad)" — which surfaces some frontend skills (TypeScript, React) as gaps.
  Honest (they ARE common in the field) but diluted; sharper role-level gaps
  need more per-role, per-country volume.
- 🟡 **Roadmap "certs" are description-text ILIKE counts.** "CKA in 41 postings"
  is a substring match on descriptionRaw — real, but it'd also catch a passing
  mention or a coincidental substring. Good enough to surface; not a curated
  requirements parse.- 🟢 **Vercel VOYAGE_API_KEY added + all profiles backfilled.** Prod was missing
  the key, so every profile created on the live site shipped with no embedding
  and matched on recency — a US backend engineer was shown Indian security roles.
  Key now on Vercel (verified: prod profile creation returns embedded:true), and
  scripts/backfill-profile-embeddings.ts embedded the 6 pre-existing profiles
  (real ones included). Verified: the backend-engineer profile went from Meesho
  security roles to 12/12 engineering matches (Palantir/PostHog/Xero, scores
  82-84). The script is resumable (embedding IS NULL only) and bumps matchVersion
  so the stale recency-based MatchScore cache is dropped.
- 🟡 **The feed "Refine" box was a disabled placeholder that looked active** —
  owner tried to filter with it. Now a dashed "Soon" pill, clearly not-yet-built.
  The real filters are the pills (All matches / Remote / Hourly). "Saved" also
  still returns empty (saves not wired).- 🟢 **Build-time DB dependency crashed a deploy — fixed.** The /jobs hub was
  statically pre-rendered and called getBrowseHub (7 DB aggregates) at build, so
  a transient "can't reach database server" during one Vercel build failed the
  whole deploy — and Vercel kept serving the previous good build, so an
  unrelated nav fix silently never shipped. /jobs is now force-dynamic (no
  build-time DB) and getBrowseHub returns an empty hub on DB error. Audited: no
  other statically-pre-rendered page hits the DB unprotected (API routes and
  cookie/searchParam pages are all dynamic). Lesson: a failed prod build is
  invisible unless you look — worth a staging/CI build check before launch.
- 🟢 **US source expansion: +12 boards (13 → 25 sources).** Reddit, Pinterest,
  Roblox, Samsara, Instacart, Twilio, Coinbase, Robinhood, Affirm, Chime,
  Mercury, Ramp — all US-heavy (60-100%) with real marketing/design volume, all
  verified with the live crawlers (0 missing, 0 "(copy)"/demo, unique
  externalIds). Seeded, NOT yet ingested — the next cron `Ingest jobs` run (or a
  manual trigger) crawls them. Projected to roughly double the US corpus and
  take US marketing/design inventory from thin (~60) to a few hundred, which
  lifts it over the stats confidence floor for real marketing/design users.- 🟢 **US expansion partially ingested: +776 LIVE (1135 → 1911), US-eligible
  ~300 → 923.** US marketing 7 → 28 eligible (over the stats floor now), Design
  & Creative 15 eligible. Embeddings backfilled after.
- 🔴 **Anthropic credits ran dry mid-ingest — 1,107 jobs failed** ("credit
  balance is too low"). A ~2,000-job manual batch drained the balance in one
  shot. No corruption (failed jobs just aren't created; they retry). The
  remaining ~1,100 come in on the NEXT cron ingest — but ONLY if Anthropic
  credits are topped up first, or that cron fails the same way. Pre-launch: set
  a low-balance alert / spend cap in the Anthropic console, and prefer the cron
  (which spreads extraction out) over big manual batches.
- 🟢 **All +776 new jobs embedded (0 unembedded LIVE jobs).** The deferred
  Voyage backfill finished, so every job from the source expansion is now
  retrievable by the matcher — not just live in the DB.
- 🟢 **Marketing insights are reliable now, and honestly harsh.** With 28
  US-eligible marketing jobs (over the floor), a strong 13-yr generalist scores
  ~10% skill coverage — because the US-eligible marketing inventory skews B2B
  SaaS / product-marketing / growth, which names specific skills (go-to-market,
  product marketing, ABM, sales enablement, A/B testing, campaign management)
  that a brand/digital generalist doesn't list. This is a TRUE signal (where
  current demand is), not a matcher bug. The strict token-subset matcher is
  deliberately kept strict: crediting "digital marketing strategy" as
  "campaign management" would be flattering guesswork.
- 🟢 **Taxonomy fragmentation was double-counting skills — fixed.** The skill
  taxonomy splits one concept into variants ("Data analysis"/"Data analytics",
  "GTM strategy"/"Go-To-Market Strategy"). Insights now fold spelling/acronym
  variants (light stem + acronym map) and dedupe demanded skills by canonical
  token-subset before scoring, so a concept is counted — and shown as a gap —
  exactly once. Root cause is upstream (the extractor mints near-duplicate
  Skill rows); a real fix is a skill-canonicalization pass at ingest, later.
- 🟢 **Marketing postings name ~no certifications** (0 of 99 marketing+design
  live postings named Google Analytics/Ads, HubSpot, Blueprint, PMP, etc. as a
  cert). So the Panel-4 certs section is legitimately empty for marketers —
  unlike tech/finance (AWS/CPA/PMP). Not adding marketing cert patterns: they'd
  match nothing, and faking demand violates the engine's counted-only doctrine.
- 🟢 **Prod test-data cleanup done.** Deleted 7 test profiles (Priya Raman ×2,
  an unnamed throwaway, an anonymous empty-userId session, Hooria Ahmad ×3) and
  3 test job-alerts (zia.esource ×2, hooriaa.ahmad ×1). No fake jobs or waitlist
  rows existed. Prod now holds only the owner's own 2 profiles (PK + US) and 0
  alerts — confirmed "no real users yet". Note: without SUPABASE_SERVICE_ROLE_KEY
  locally we could only delete Profile rows, not the orphaned Supabase auth
  users; those clear via the app's delete flow once the key is on Vercel.
- 🟢 **Trucking questionnaire built (spec §3.4).** `/drive` — 8 questions (CDL
  class, endorsements, years, route, home-time, freight, clean record, pay
  floor) + optional location. Maps DETERMINISTICALLY (no LLM → zero Anthropic
  spend) to the same ParsedResume + preferences shape the résumé flow produces,
  commits via createOrUpdateProfile with entryPath=QUESTIONNAIRE (skills tagged
  USER_ADDED), embeds via Voyage, lands on the same /feed. Verified end-to-end
  in the browser: role resolves (OTR Driver→"OTR Truck Driver"), country derives
  from location, matches flow, feed renders, and the email-alert card even
  personalizes to "OTR Truck Driver jobs". Entry points: a link on /onboard and
  the direct /drive URL.
- 🟡 **Questionnaire deliberately sets NO employment/remote hard-filter.** Those
  are HARD filters in match.ts; the driver never chose them, so assuming
  "full-time / onsite only" would silently hide part-time or mislabeled driving
  jobs. Left empty — their answers drive matching via skills + embedding; only
  the pay floor they explicitly gave stays a filter. (Résumé flow is safe: the
  user actively ticks those there.)
- 🟢 **Real CDL driving inventory now live (2026-07-18).** trucking-logistics went
  from 21 misclassified LIVE jobs (0 real drivers) to **44 genuine driving roles**.
  Three things landed:
  (a) **Sources added** (`scripts/seed-sources.ts`): five boards posting genuine
  CDL/driving roles, each verified against the live crawlers before seeding (0 dup
  externalIds, 0 missing fields, 0 demo/"(copy)" titles) — Misfits Market (gh: CDL
  A/B, Class C Truck + Delivery Drivers), Stack AV (gh: CDL-A ops specialists),
  Kodiak Robotics (gh: CDL/safety drivers), Outrider (gh: CDL-A AV test operators),
  Waabi (lever: CDL vehicle operator). Ingested clean: 243 jobs created, 0 failed,
  5 deduped. Honest limit: the big OTR carriers (Swift/Schneider/Werner/JB Hunt)
  aren't on Greenhouse/Lever/Ashby, so the CDL inventory these ATSs expose is
  grocery/meal-kit local & regional CDL delivery plus autonomous-truck safety
  drivers — real driving, but not long-haul OTR.
  (b) **Classifier tightened** (`lib/ingestion/llm-extract.ts`): `trucking-logistics`
  now means COMMERCIAL DRIVING ONLY (operate a commercial vehicle, or dispatch
  drivers). Warehouse/fulfillment/inventory/supply-chain/last-mile *ops management*
  → `operations-hr`; fleet/telematics/logistics *software* → `tech-software`. On
  the new sources the tightened prompt filed every CDL/driver role correctly.
  (c) **Existing 21 reclassified** (`scripts/reclassify-verticals.ts --apply`):
  the prompt fix does NOT reach already-ingested rows on a plain re-crawl —
  `extractWithLlm` returns the cached vertical for a matching `descriptionHash`,
  so unchanged text keeps its old (wrong) vertical. The new script forces a fresh
  classification (`extractWithLlm(..., { skipCache:true })`, added a `skipCache`
  opt) and updates only `verticalId`; dry-run by default, `--apply` to write.
  Result verified live: 16 → operations-hr (Deliveroo warehouse/pickers, Meesho
  last-mile/sort-center, Wolt courier-supply), 5 → tech-software (Samsara
  telematics/implementation), and all 44 real drivers kept. 0 legit drivers moved.
- 🟡 **New driving jobs' embeddings backfilling (2026-07-18).** The 243 new jobs
  ingested with `--skip-embeddings`; `scripts/backfill-embeddings.ts` is filling
  them in (throttled — Voyage free tier is 3 RPM, ~80 min for 241). Until each has
  an embedding it can't be retrieved by the pgvector stage-1 matcher, so a driver's
  /drive feed won't show the full driving set until the backfill completes. Verify
  the /drive → feed flow surfaces real CDL/driver matches once it finishes.

## Company presence — work, testimonials, clients, articles, team (added 2026-07-31)

Migration 045. Everything below is user-generated content on a page we host,
which is why so much of this section is about links and indexing rather than
about features.

- 🔴 **A real bug found while building this: `sanitizeBlogHtml` had never
  actually applied `target="_blank" rel="noopener noreferrer"`.**
  `sanitize-html` filters attributes **after** `transformTags` runs, so the
  `rel`/`target` the transform added were added and then immediately thrown
  away, because `allowedAttributes.a` listed only `href` and `title`. Blog
  posts have been emitting bare external links since the sanitizer shipped —
  reverse-tabnabbing exposure, and it would have silently swallowed the
  `nofollow` this whole feature depends on. Fixed by allow-listing `rel` and
  `target` in both sanitizers. **No backfill was needed**: all three existing
  posts were checked and contain zero external links.
- 🟢 **Company articles get their own table, not `Post`.** `app/blog`, the tag
  pages, `app/sitemap.ts` and `/hq/posts` all read `Post` with no author
  filter, and `sanitizeBlogHtml` leaves external links **dofollow** on purpose
  because /hq chose them. A company article is UGC and must be nofollowed and
  must not appear on /blog. One shared table would have made that a filter
  every future query has to remember; `CompanyArticle` makes it true by
  construction. Same reasoning for `CompanyWork` vs `Portfolio`.
- 🟢 **`sanitizeUgcHtml` (lib/sanitize.ts)** is the company-article sanitizer:
  external links get `UGC_REL`, internal links stay plain, and `<img>` is
  dropped unless its origin is our own storage — a remote image on a page we
  serve is a tracking pixel that reports every reader to a third party.
  Verified: 29/29 assertions in a throwaway harness, including that a
  `<script>` is stripped and a foreign cover path is refused.
- 🟢 **Indexing is decided by `lib/company/indexing.ts`, and the sitemap calls
  the same functions.** Before 045 a company page was a name, a tagline and a
  list of postings — nothing worth farming. It now carries testimonial copy and
  outbound client links, so it gets the same treatment profiles got: a
  substance bar (about ≥40 chars, or a tagline ≥20, or a live role) and a spam
  score, with `Company.spamCleared` overriding the score only, never the
  substance. Verified end to end on a throwaway company: the company page and
  its long case study served `index, follow` and appear in `sitemap.xml`; the
  deliberately short article served `noindex, follow` and is **absent** from the
  sitemap. Rodeo Graphics still indexes and is still listed — the new gate did
  not deindex the one real company.
- 🟡 **Testimonials are unverified by construction, and the page says so.**
  These are quotes the company typed about itself. They are *not*
  `Endorsement`s — an endorsement is written by a signed-in third party through
  a link the subject cannot edit. The public page labels them "Provided by
  {company}. Topezia hasn't verified these." and carries **no `Review` or
  `AggregateRating` JSON-LD** (verified: 0 occurrences). Adding that markup
  would launder unverified copy through a vocabulary that means something
  stricter, and is the single most tempting shortcut in this whole feature.
- 🟡 **Team membership is a listing, not a permission.** A `MEMBER` appears on
  the company page and can do nothing else — no editing the company, no
  posting roles, no seeing applicants. `requireCompanyOwner()` is the only
  gate, in one file, so widening it later is one change. The ask was "invite
  team members to join and be listed"; handing every invitee write access to
  an employer's public page and hiring pipeline is a permissions system nobody
  asked for.
- 🟡 **Accepting an invite requires the signed-in account's email to match the
  invited address.** Otherwise an invite link is bearer-authorization: anyone
  it is forwarded to could list themselves as staff at a company they have
  nothing to do with. This is also the most likely reason a real invite fails,
  so the invite email, the dashboard and the /join page all say it up front.
  A failed email lookup **refuses** the join rather than waving it through.
- 🟡 **Invite delivery failure does not fail the request.** The invite row and
  its link are the artifact; the email is a convenience. When Resend is
  unreachable — or `RESEND_API_KEY` is unset — the owner gets the link back and
  can send it themselves. The email carries **no free-text message**, because
  an invite that let the sender type a paragraph would be an open relay with
  our sending reputation on it.
- 🟡 **Article body images are not garbage-collected.** Deleting an article
  removes its cover from storage but not images embedded in the body, because
  nothing tracks which objects a given body references. Same gap the /hq blog
  has had since it shipped; the fix for both is one pass that parses stored
  HTML for our own storage URLs. Orphaned bytes, not broken pages.
- 🟡 **A company survives its owner deleting their account.** `ownerUserId` is
  a plain string with no FK to `auth.users` (it predates this work), so
  `lib/account/purge.ts` leaves the Company row and everything cascading from
  it. Pre-existing; worth knowing now that far more hangs off a Company.
- 🟢 **`/hq/spam` now scores companies too**, so `Company.spamCleared` has a
  button rather than needing hand-written SQL. A company is scored as one
  document — name, tagline, about, testimonials, client names, published work
  and article bodies together — and a reviewer can pull a single piece of work
  or one article back to DRAFT rather than acting on the whole page.
- 🟢 **Storage: a new public `company` bucket** (10MB, raster only, no client
  write policy) for work images and article covers; client logos live in the
  existing `logos` bucket under `{companyId}/clients/`. Created with
  `scripts/setup-company-storage.sql`. Uploads still go through our own route,
  which sniffs magic bytes and picks the path — the declared Content-Type and
  the filename are ignored.
- 🔴 **Uploads need `SUPABASE_SERVICE_ROLE_KEY`, which is not set locally.**
  Every upload route in the project degrades the same way ("Uploads are
  temporarily unavailable", HTTP 500). The image paths in this feature were
  verified by validation and by rendering, **not** by a real upload.

## Company work: gallery upload + video embeds (added 2026-07-31)

- 🔴 **Gallery upload silently did nothing.** The multi-file input read
  `e.target.files` into a variable and *then* did `e.target.value = ""` to
  reset the control. `FileList` is LIVE — clearing the input empties the list
  the variable points at, so the length check that followed saw zero and the
  upload never started. No error, no network request, nothing in the console.
  The cover input was written a line differently (`e.target.files?.[0]`, which
  copies a real `File` out first) and was unaffected, which is exactly why the
  symptom was "cover works, gallery doesn't". Fixed by `Array.from(...)`
  before the reset — the same order `app/portfolio/new/portfolio-editor.tsx`
  already used. **Reproduced and re-verified in a browser**, not reasoned
  about: old path 0 files, fixed path 2.
- 🟢 **Videos on company work (migration 046).** YouTube and Vimeo embeds were
  never built for companies — only the member portfolio had them — so this was
  a missing feature reported as a bug, which is a fair reading when the two
  surfaces otherwise mirror each other. It now reuses
  `lib/portfolio/video.ts`, the `/api/portfolio/video-poster` proxy and the
  `VideoEmbed` component wholesale rather than growing a second parser.
  Verified: 7 real link shapes parse (watch, youtu.be, timestamped, shorts,
  vimeo, vimeo unlisted, player.vimeo), junk and `javascript:` are refused,
  the embed resolves to `youtube-nocookie` (already in the CSP `frame-src`),
  the poster is proxied through our own origin, and **zero iframes exist
  before a click** — click-to-play is what keeps a megabyte of player JS off
  the page and the provider's branding out of the still frame.
- 🟡 **A pasted link is never stored raw.** It is parsed to a provider + id,
  and the iframe `src` is rebuilt by us from those two values. A "YouTube
  link" that is really something else cannot become an arbitrary embed on a
  page we host.
- 🟡 **`CompanyWorkImage` became `CompanyWorkMedia`** because it now holds
  videos and the old name stopped being true. The table was dropped and
  recreated rather than altered — it was one day old and held **zero rows,
  verified before writing the migration**, and the migration carries a guard
  that raises rather than dropping if that is ever untrue.
- 🟡 **Only `kind: IMAGE` rows carry a storage path.** A VIDEO row's `path` is
  the provider id, so both the edit and delete paths filter on kind before
  handing anything to storage cleanup — otherwise we would ask Supabase to
  delete an object named `dQw4w9WgXcQ`.

## Reporting company pages, work and articles (added 2026-07-31)

- 🟢 **Migration 047 adds `COMPANY`, `COMPANY_WORK` and `COMPANY_ARTICLE` to
  `ReportKind`.** Company pages carry testimonial copy and outbound client
  links — the surface a visitor is best placed to notice going wrong — and
  until now they were the only public UGC on the site with no way to flag them.
  Purely additive: three enum values, no row changes.
- 🟢 **The existence check is a map keyed by kind, not a ternary.** Adding a
  reportable kind and forgetting to teach the route how to look it up is an
  omission that fails OPEN (a report about nothing lands in the queue), and
  TypeScript cannot catch that in a ternary that already has an else branch.
  A `Record<Kind, () => Promise<number>>` makes the compiler catch it.
- 🟢 **Work and articles are only reportable when PUBLISHED.** A draft isn't
  visible to whoever is reporting it, so a report naming one did not come from
  reading the page.
- 🟢 **A report about a company's work or article surfaces THE COMPANY** in
  /hq/spam, even when the company scores clean. Without that mapping a reported
  page would appear as a lone line in the Reports list with nothing to act on.
  Verified end to end: a real report filed through the live route against the
  Rodeo Graphics case study surfaced "Rodeo Graphics" through the same mapping
  the queue uses; probe rows deleted afterwards (0 unresolved reports remain).
- 🟡 **Anonymous reports still do not collapse.** The unique index is
  `[kind, targetId, reporterUserId]` and NULLs are DISTINCT in Postgres, so two
  signed-out reports about the same page create two rows — bounded by the
  route's rate limit, not by the index. Unchanged from migration 044 and
  deliberate; noted here because it surprises on first sight in the queue.
- 🟡 **The control names what it reports.** "Report this page" is ambiguous on
  a company page, which shows a company, its work and its articles at once, so
  `ReportButton` now carries a per-kind default: "Report this company",
  "Report this work", "Report this article".

## Company is its own entity, not part of a member's profile (2026-07-31)

Stated by Brandon as a standing principle: "company is a separate person/user
owned by a different user… it should not be mixed with my profile/content
database". Recording what that means concretely, because most of it was
already true and the exceptions are the interesting part.

- 🟢 **Content was already fully separate, by construction.** `CompanyWork`,
  `CompanyArticle`, `CompanyTestimonial`, `CompanyClient`, `CompanyTeamMember`
  and `CompanyInvite` are their own tables keyed to `companyId` — never to a
  `Profile`. Verified by query, not assumption: the six files that read
  `prisma.portfolio` never touch company work, and the four that read
  `prisma.post` never touch company articles. Company work cannot surface in
  `/portfolio`, company articles cannot surface in `/blog`, and nothing about a
  company appears on `/p/{slug}`. Separate storage bucket, separate spam score,
  separate `spamCleared`, separate indexing decision.
- 🟢 **The employer area now has its own shell** (`EmployerShell`). It used to
  render inside `AppShell` — the job-seeker sidebar with My Profile, Resume
  Builder, Saved Jobs, My Work — so managing a company happened inside a
  personal job hunt. The company shell shows the COMPANY's logo, name and
  sections, with exactly one clearly-named route back ("My job search").
  Verified signed-out: no member nav string appears anywhere on the page.
- 🟡 **The team roster still reads member profiles, and that is intended.**
  Brandon's call when asked directly: "Company should show the staff profiles
  anyway." A team is made of real people who have Topezia profiles, so the
  roster shows their name, their profile role and a link to `/p/{slug}`. That
  is a RELATIONSHIP between two entities, not company content stored on a
  profile — the distinction that keeps it consistent with the principle above.
- 🟡 **Applicants and sourcing show member profiles too**, and must. That is
  the hiring product working, not leakage.
- 🔴 **There is no separate company login.** `Company.ownerUserId` is a
  personal Supabase account id, and one company per account is
  schema-enforced. "Log in as Rodeo Graphics", or two people administering one
  company, is an auth change — not a small one — and nothing in the current
  design assumes it will never happen. `requireCompanyOwner()` is the single
  gate, so the blast radius of changing it later is one file.

## JobPosting: jobLocation and addressCountry (Search Console, 2026-07-31)

Two new issues reported the same day the previous fix
(`applicantLocationRequirements`) was validated as fixed. Both were measured
against the LIVE site before touching anything — 438 indexed URLs, 4,824
JobPosting items — rather than reasoned about from the code.

- 🔴 **"Missing field jobLocation" (critical) — fixed, 0 remaining.** Every
  affected item was a fully-remote posting: `jobLocationType: TELECOMMUTE` with
  `applicantLocationRequirements` set and no `jobLocation`. Google's docs say
  jobLocation is optional once jobLocationType is TELECOMMUTE; **Search Console
  disagrees in practice** and reports it as critical. We now emit
  `jobLocation` with the same country already asserted in
  `applicantLocationRequirements` — the honest answer (the work IS performed
  there, remotely) and, by construction, one that cannot contradict the field
  beside it. Verified across all 13,655 emitted postings: **0 without
  jobLocation.**
- 🟡 **"Missing addressCountry" (non-critical) — 542 at-risk rows down to 116
  emitted items (0.85%).** Recovered by reading a country that is already IN
  the location string, two real ATS conventions: a leading code
  (`"CAN: VAN (333 Seymour St)"` → CA) and a trailing name (`"Tokyo, Japan"`
  → JP). The remainder are real cities with no country anywhere in the text —
  "Aberdeen", "Bergamo", "Monza". Resolving those needs a geocoder; guessing
  would put a wrong country in front of Google, which is worse than an
  incomplete one.
- 🟢 **The name→code table is built from `Intl.DisplayNames`, NOT from
  `COUNTRY_NAMES`.** That constant is the product's MARKET list and feeds the
  work-eligibility picker — growing it so a job in Skopje parses would have
  silently added North Macedonia to a form that means something else. Parsing
  needs every country; the picker needs the ones we serve.
- 🔴 **We were publishing non-places as cities, and that cost 377 postings to
  stop.** `addressLocality` accepted "Home based", "In-Office", "N/A",
  "Europe", "North America" and "NAMER", so the markup claimed an office in a
  town called Home based. Those strings are now rejected, and a non-remote
  posting with no usable address emits no JobPosting at all — emitted items
  went 14,032 → 13,655. That is a deliberate trade: 377 items lose rich-result
  eligibility, and none of them had a location to publish. They still appear
  on the site and in the feed; they just no longer assert a workplace we don't
  know. Top offenders were "Home based - Worldwide" (92), "Home based - EMEA"
  (81), "In-Office" (48).
- 🟡 **Both emitters share one definition.** `lib/seo/job-posting-ld.ts` is
  used by the job detail page AND the SEO listing pages' ItemList, so neither
  can drift into its own idea of a valid posting — the failure mode that
  caused the earlier `applicantLocationRequirements` breakage.

## Job location: read the field the source already gives us (2026-07-31)

Follow-up to the JobPosting fix above. Dropping markup for postings with no
location was safe but lazy — the location mostly wasn't missing, we weren't
reading it.

- 🔴 **Greenhouse returns two location fields and we used one.** `location.name`
  is often a working ARRANGEMENT ("Hybrid", "Distributed", "N/A") while the real
  city sits in `offices[]`, which the adapter already fetched and discarded.
  All 479 affected postings were Greenhouse; Cloudflare alone accounts for 196
  "Hybrid" rows whose office is "Austin, TX".
- 🟡 **A blanket "use offices instead" would have been WORSE, and was tested
  before being rejected.** Against 45 live postings: ZoomInfo "Remote" → offices
  "Bethesda" (the HQ of a remote job), MongoDB "Alberta; British Columbia; …" →
  offices "New York City" (contradicts the posting), Canonical "Home based -
  Worldwide" → offices "Office Based - London, UK". So `resolveLocation` fires
  ONLY when the primary string is a KNOWN non-location (an allow-list:
  Hybrid/Distributed/N/A/LOCATION/…) **and** the job isn't remote. Anything we
  merely failed to PARSE is left alone — "we don't recognise Aveiro" and "this
  says Hybrid" are different problems, and only the second is safe to route
  around.
- 🟢 **Geography reads the resolved string; everything else keeps the original.**
  "Hybrid" must stay the remote signal even once we know the office is in
  Austin — swapping `locationRaw` wholesale would reclassify a hybrid role as
  onsite.
- 🟢 **Canadian provinces now resolve a country** (country only — `locationState`
  is a US concept that drives the /jobs/{role}/{state} lattice, and putting "ON"
  in it would mint pages for a branch that doesn't exist). A posting listing
  "Alberta; British Columbia; Ontario" resolved to no country at all, and note
  this now correctly beats that posting's misleading "New York City" office.
- 🔴 **A regression check caught my own fix breaking two cases.** Making the US
  state abbreviation match case-insensitive turned "Abu Dhabi - Al Maqam Tower"
  into Alabama and "Canada - Remote (ON, AB, BC, or NS Only)" into Oregon,
  because "Al" and "or" LEAD those components. A mixed-case code may now only
  match when the component IS the code (optionally plus a ZIP); uppercase may
  still lead a longer component, because a real code is written in caps.
  Re-verified: 5,999 of 6,000 already-resolved jobs unchanged, the 1 difference
  a correction of a stale stored value.
- 🟡 **Impact, job-weighted: 330 of the 1,078 live jobs with no country.** 17
  resolve from the parser alone; 313 resolve on the NEXT INGESTION RUN, because
  `offices[]` is not stored on the row and has to come back from the source.
  Nothing changes for existing rows until then.
- 🟡 **The remaining ~748 are mostly "Home based - Worldwide" / "Remote - EMEA".**
  Those name no country anywhere, and Google requires at least one eligible
  country for a remote posting. There is no honest markup for them.

## Testimonial invites: a client can write it themselves (2026-07-31)

Migration 049. Until now a company could only TYPE a testimonial, which is
copy about itself. It can now ask the client to write one.

- 🟢 **Two origins, and the public page prints which.** `COMPANY` is what the
  company typed; `INVITED` was written by whoever controlled the email address
  the company sent the invitation to. The section note says "Provided by
  {company} unless marked otherwise", and invited quotes carry a
  "written by the client" badge. Neither ever says *verified* — see below.
- 🔴 **The company cannot edit or delete an INVITED testimonial.** It may hide
  it, and nothing else. That asymmetry IS the feature: a quote the subject can
  rewrite is a quote the subject wrote, and the page claims a client wrote it.
  Both the PATCH and DELETE routes return 403 with an explanation, and the
  dashboard renders "Hide" instead of Edit/Delete rather than offering buttons
  that 403. Same rule and same reasoning as lib/endorsements/doc.ts.
  Deleting is refused specifically because hiding already gives the company
  every legitimate outcome, while deletion would let one bin the responses it
  disliked and leave no trace it ever asked.
- 🟡 **No account required to answer, deliberately.** The member endorsement
  flow requires the author to sign in; a design client has no reason to hold a
  Topezia account, and requiring one would kill the response rate. What the
  token proves is that they received the email — NOT identity — and the badge
  wording claims exactly that and no more.
- 🟢 **The invite inherits the team-invite spam posture wholesale**: owner
  only, two rate-limit windows (15/hour, 50/day), 25 outstanding maximum,
  disposable addresses refused, and no free-text message from the sender.
  Delivery failure does not fail the request — the owner gets the link back.
- 🟢 **Submissions run the same validation and spam scoring** as the owner's
  own path (`validateTestimonial`). Being invited is not a reason to skip
  either. Verified end to end against the live routes: a too-short quote is
  refused with the same message, a real submission lands, and the token is
  consumed so a second use fails. Probe rows deleted afterwards.
- 🟡 **Still no Review/AggregateRating markup, for either origin.** An invited
  testimonial is better evidence than a typed one, but it is still not a
  verified review, and 1 confirmed occurrence of that markup would be one too
  many. Verified: 0 on the rendered page.

## Company contact form + inquiry inbox (added 2026-08-01)

Migration 050. A company can turn on a contact form on its public page;
submissions land in an inbox at /employer/inquiries; members see theirs at
/messages. The design in one sentence: the form is the only way in, a
submission is an inbox item rather than a chat, and a thread exists only once
the company replies.

- 🔴 **The sender is never told what happened to an unanswered message.**
  NEW, ARCHIVED and SPAM all read as "Sent" on /messages — the status enum is
  mapped down server-side in /api/inquiries and never crosses the boundary.
  This is deliberate and load-bearing: telling someone they were marked spam
  turns a quiet judgement into a confrontation, and companies would stop
  using the mark. Do not "improve" the member view with delivery states.
- 🔴 **A reply is the only thing that opens a thread.** PATCH on an inquiry
  can never set REPLIED; only the reply POST does, transactionally with the
  first message. Restoring an archived-after-reply inquiry goes back to
  REPLIED (repliedAt is the durable record), never to NEW.
- 🟢 **Spam economics**: one open inquiry per member per company (partial
  unique index `CompanyInquiry_open_one_per_sender`, so races lose), 3
  submissions per member per day + 10 per IP per day (in-process windows,
  same honest limitation as every rateLimit call), a 30-day per-company
  cooldown after any non-replied outcome, scoreUgc with links NOT expected on
  the submission, and a platform-wide lockout once 3+ DISTINCT companies have
  marked a sender spam — computed from the rows at submit time, no counter,
  and reported as a plain 429 so the lockout is indistinguishable from rate
  limiting.
- 🟡 **Emails ride the existing Resend path** (owner on new inquiry, member
  on company reply, owner on member reply). Delivery failure never fails the
  request — `emailed: false` and the row is the artifact. All content is an
  escaped 180-char snippet plus a link.
- 🟡 **The authed loop is verified at the API-guard and page-render level
  only** (401s, gates, DB objects, tsc): submit→inbox→reply→reply needs two
  real signed-in accounts clicking through on prod, same standing gap as the
  post→apply→shortlist loop. Migration 050 was applied to the live DB by
  hand BEFORE the push (additive only), the safe order from 045.
- 🟡 **Config lives on Company** (contactEnabled/contactReasons/
  contactQuestions) and the inbox page is also the settings page — three
  fields did not earn a settings route. Answers are snapshotted onto the
  inquiry as [{question, answer}], so editing questions later cannot corrupt
  history. The reply box caps a thread at 60 messages: past that, the two
  parties have each other's attention and email.
- 🟡 **Team members do not see the inbox.** requireCompanyOwner() gates every
  inquiry route, same as all /api/company writes — the team is a listing, not
  a permission (see "Company presence" above). Widening it is one file.

## Site chat widget — Phase 1 (added 2026-08-01)

Migration 051. An embeddable AI chat bubble for a company's OWN website:
one script tag → iframe from /widget/{token} → answers grounded in a crawl
of their site → human handoff lands in the same /employer/inquiries inbox as
the contact form. Set up at /employer/widget or scripts/setup-widget.ts.

- 🔴 **Widget inquiries have no Profile, on purpose.** `CompanyInquiry.
  profileId` went nullable in 051; source=WIDGET rows carry visitorEmail/
  visitorName/threadToken/transcript instead. The visitor's thread lives at
  /i/{threadToken} — the token is only ever EMAILED, never returned to the
  browser, so holding the link proves the mailbox (same posture as
  testimonial invites). FORM inquiries still require a signed-in profile in
  the route.
- 🔴 **/widget/* is the ONE route allowed to be iframed.** next.config.js
  excludes it from the catch-all security headers (multiple CSP headers
  intersect, so overriding can only tighten — exclusion is the only way to
  relax) and serves frame-ancestors * with no X-Frame-Options. Nothing on
  that page may ever hold a session-authenticated action.
- 🔴 **Grounded or silent.** The answer prompt forbids anything not in the
  retrieved excerpts (prices/dates/promises explicitly), treats crawled text
  as quotable-never-executable (prompt injection), and returns strict JSON
  {reply, sources, handoff}; cited URLs are filtered against what retrieval
  actually returned. Parse failure = handoff, not a guess.
- 🟢 **Cost shape**: free tier is 1 site, 40 pages/crawl, 200 AI replies/
  month (lib/widget/caps.ts — conditional-UPDATE spend, month rolls by
  comparison, no cron). At the cap the bot STOPS calling the model but KEEPS
  taking messages — the AI is capped, the lead flow never is. Voyage is on a
  paid tier (per scripts/backfill-embeddings.ts) so crawl embedding is not
  rate-bound.
- 🟡 **The crawl runs inside the POST** (maxDuration 120): sitemap-first,
  40-page/300-chunk caps, 10s/page timeouts, chunk writes are sequential NOT
  transactional (a 600-statement interactive tx through the pooler P2028s;
  the table is a cache — the next crawl repairs a half-write). Re-crawl is a
  manual button; freshness cron is Phase 2.
- 🟡 **No Turnstile on widget endpoints yet** — anonymous surface guarded by
  IP windows, disposable-email refusal, scoreUgc, and one open inquiry per
  visitor email per company (partial unique index). Add Turnstile if real
  abuse shows up.
- 🟡 **No WordPress plugin yet** — the snippet works anywhere; the WP plugin
  is Phase 2 packaging for the directory's distribution, not function.
- 🟡 **Pricing is a recommendation only.** No paid tier is shipped and no
  upsell UI exists — employer billing isn't built (see Stripe notes), and
  fake upgrade buttons are against the house rule.

## WordPress plugin for the site chat widget (added 2026-08-01)

`wordpress/topezia-chat/` (source) → `public/downloads/topezia-chat.zip`
(served at /downloads/topezia-chat.zip, linked from /employer/widget). Build
with `bash scripts/build-wp-plugin.sh` after ANY edit under wordpress/ — the
zip is committed, so an unbuilt edit ships stale.

- 🟡 **The plugin is deliberately one option + one script tag.** All logic
  lives on topezia.com; the plugin stores `topezia_chat_site_key`, enqueues
  widget.js async in the footer (skipping admin/feeds/embeds/previews), and
  refuses keys that don't match the token shape. Resist adding features to
  the PHP side — WordPress is the one environment we can't redeploy.
- 🟡 **readme.txt carries the required "External services" disclosure**
  (script + iframe from topezia.com, chat content and visitor email stored
  by us, crawl of the registered domain). WP directory review rejects
  plugins that phone home without this — keep it in sync with reality.
- 🟡 **NOT yet submitted to the WordPress plugin directory.** Submission at
  wordpress.org/plugins/developers/add/ needs a wordpress.org account
  (Brandon's), review takes days-to-weeks, and the readme references
  /terms and /privacy pages that must exist on topezia.com first (they do —
  app/terms, app/privacy). Until then the zip upload path works everywhere.
- 🟡 **PHP is not linted locally** (no php on this Mac; build script skips).
  The code is standard WP settings API — but any nontrivial PHP change
  deserves a run through `php -l` somewhere before shipping the zip.

## Widget ecommerce awareness (added 2026-08-01)

Migration 052 (SiteProduct). The crawl harvests Product JSON-LD (Woo/
Shopify/BigCommerce all emit it); buy-intent questions retrieve nearest
products and the reply leads with a pitch plus up to 3 preview cards
(image/name/price/View). "Is this an ecommerce site" is implicit: products
found = yes, zero config.

- 🔴 **The model orders the shelf, never stocks it** — it returns indexes
  into what retrieval offered; cards are built server-side from SiteProduct
  rows, so a hallucinated product cannot render. Prices come only from the
  product's own price field ("From $X" for AggregateOffer.lowPrice); price
  absent → card shows none, reply may not invent one.
- 🟡 **rodeo.graphics legitimately has 0 products** — its sellable items are
  Yoast ARTICLES, not Product markup (verified by inspecting the pages, not
  assumed). Cards will never show there until the shop items become real
  WooCommerce/Shopify products; the bot still pitches from prose. Extraction
  itself verified on synthetic fixtures (plain, @graph, AggregateOffer) and
  a live Shopify store.
- 🟡 Some stores bury price in variant structures the extractor doesn't
  chase — the card renders without a price, which is honest. Extend
  extractProducts if a paying customer's store needs it.

## Widget mobile + free-tier attribution (added 2026-08-01)

Migration 054 (`WidgetSite.branded`, default true).

- 🔴 **`branded` is the switch a paid plan will flip — nothing flips it
  today.** There is no employer billing surface, so a real customer who pays
  gets it set by hand (`UPDATE "WidgetSite" SET branded=false WHERE ...`)
  until billing exists. When false the widget shows NO line at all: no
  branding, no "free", no trace. Never render a fake upgrade button here.
- 🟡 **16px inputs under 820px is an anti-zoom fix, not a style choice.**
  iOS Safari zooms any focused input whose text is <16px, and inside an
  iframe that zoom sticks — the visitor drags a magnified chat around.
  `user-scalable=no` is ignored by modern iOS and would break pinch-zoom for
  everyone, so the font size IS the fix. Verified computed 16px at 390px.
- 🟡 **Phones get a full-screen iframe** (widget.js `sizeFrame`), the
  launcher bubble hides while open, and the chat carries its own ✕ which
  postMessages `topezia:close` to the parent — the parent owns the iframe,
  so it cannot close itself. Desktop keeps the corner card.

## Widget streaming + page-aware openers (added 2026-08-01)

- 🔴 **The stream protocol is prose-then-marker, not JSON.** The model
  writes the reply as plain text (relayed as NDJSON {"t":"delta"} events),
  then one `<<<META>>>{json}` line with sources/products/handoff. The
  marker is held back from the visitor by a tail buffer; a missing meta
  degrades to plain prose (no cards, no handoff), never a failure. The done
  event repeats the full reply so fallback paths that never streamed still
  arrive whole. Don't "simplify" back to full-JSON output — that's what
  made replies land in one 4-second lump.
- 🟡 **Openers are deterministic.** ?page= from the loader is matched
  against the crawl (SiteProduct first, then SiteChunk title) — no model
  call until the visitor speaks. Only same-domain URLs count; the homepage
  keeps the default hello. The page's own product is also force-included in
  retrieval ("how much is it?" on a product page means THAT product).
- 🟡 Reply text is rendered as plain text — the prompt forbids markdown;
  if asterisks ever show up in bubbles, that rule regressed.

## Draft-with-AI in the company inbox (added 2026-08-01)

- 🔴 **The draft only fills the compose box.** POST
  /api/company/inquiries/{id}/draft returns text and changes nothing — no
  message row, no status change, no email. The owner edits and sends
  through the normal reply POST, which is where spam scoring, the thread
  cap and the closed-state refusal live. Never wire the draft to send
  directly; the whole safety story is that every outbound reply passes the
  same checks whether typed or drafted.
- 🟡 **Grounding = conversation + (if the company has a crawled widget
  site) the nearest site chunks/products** (lib/widget/draft.ts). The
  prompt restricts facts to what's written and turns missing info into a
  clarifying question. Verified live against the Rodeo Graphics thread:
  the draft's claims ("bio card", "social media kit", the $99–$299 range)
  all trace to crawled chunks. A company with no widget site still gets
  drafts, grounded on the thread alone.
- 🟡 **AI-cost feature, currently metered only by rate limit** (30/hr per
  owner). Destined for the paid tier once employer billing exists — same
  standing rule as widget replies, no upsell UI until then.

## Weekly "what visitors asked" digest (added 2026-08-01)

- 🔴 **The cron does not run until CRON_SECRET is set in Vercel.** The
  route (/api/cron/widget-digest, Mondays 13:00 UTC via vercel.json) fails
  closed — no secret, 404, no digests. Set a CRON_SECRET env var in the
  Vercel project; Vercel then sends it as the Bearer token automatically.
  Without it nothing breaks — owners just never get the email.
- 🟡 **WidgetQuestion is telemetry, not an archive.** The chat route logs
  each visitor question (280 chars) + whether the bot answered or handed
  off, fire-and-forget after the stream; rows purge past 90 days in the
  digest run. The digest's "your site couldn't answer these" list is the
  handoff rows — the content-gap advice is the feature's real value.
- 🟡 **Quiet weeks send nothing, on purpose.** No "0 questions!" filler
  mail. Numbers are counted from rows; the only model call groups question
  texts into themes (needs ≥4 questions; on failure the section is simply
  omitted). digestSentAt guards double-sends inside 6 days — safe to
  re-trigger the cron.
- 🟡 The digest toggle on /employer/widget is a real column
  (WidgetSite.digestEnabled, migration 055) — PATCH /api/company/widget
  accepts enabled and/or digestEnabled.

## Concierge intake + teach-the-bot (added 2026-08-01)

- 🔴 **SiteFact must survive crawls.** SiteChunk and SiteProduct are wiped
  and rebuilt on every scan (lib/widget/crawl.ts); SiteFact is the one
  piece of site knowledge a human wrote and crawls must never touch it.
  If a future crawl "cleans up" facts, "correct it once" silently becomes
  "correct it after every scan" — the whole feature.
- 🔴 **Taught answers outrank the crawl, by design.** answer.ts rule 0
  puts <owner_answer> above the excerpts, including prices and policies
  the page states. Verified live: a taught $200 logo minimum beat the
  site's $150, and deleting the fact reverted the answer to $150. A loose
  distance cutoff (0.7) drops facts nowhere near the question — tightening
  it is how you'd cause "I taught it that and it still doesn't know".
- 🔴 **The brief is EXTRACTION, never inference** (lib/widget/intake.ts).
  budget/timeline are the visitor's own words or null; a null becomes an
  open question for the owner. An inferred number here would become a
  wrong quote — never "improve" this by letting the model estimate. Brief
  failure returns null and the lead is delivered as it always was.
- 🟡 Concierge qualifying lives in answer.ts rule 6 (one short question
  per reply, only when the visitor describes a job of their own). It costs
  nothing extra — same call. The brief costs one Haiku call per real lead.
- 🟡 Two teach surfaces, one endpoint (/api/company/facts): "Fix this
  answer" under bot lines in an inbox transcript (the question taught is
  the visitor line immediately before), and the Teach the bot card on
  /employer/widget, which leads with unanswered questions from
  WidgetQuestion. 100 facts per site.

## Voice, language, theming, presence, attribution (added 2026-08-02)

- 🔴 **Revenue attribution is owner-entered, full stop.** outcome/dealValue
  (migration 057) are set only by the owner in Messages; the totals on
  /employer/widget and in the digest are sums of those rows. There is no
  payment rail and no CRM — never add an "estimated value", never infer an
  amount from the conversation, and never count a lead as revenue. A
  company that marks nothing must see zeros.
- 🔴 **The reply-time phrase is measured or absent** (lib/widget/presence.ts):
  median first-reply gap over the last 25 replied threads, needs 3+ samples,
  and returns null above ~4 days. Do NOT replace it with a friendly
  constant ("replies instantly") — that lie is exactly what it exists to
  avoid. Office hours likewise: unset means the widget says nothing about
  availability, not that someone is there.
- 🟡 **Voice input is browser-native and render-gated.** SpeechRecognition /
  webkitSpeechRecognition only; the mic button is hidden where the API is
  absent (Firefox). Dictation fills the input — it never auto-sends. No
  audio touches our servers.
- 🟡 **Language: two independent halves.** The model replies in the
  visitor's language (answer.ts rule 4b, product names/prices/URLs kept
  verbatim). The chrome uses a SHIPPED DICTIONARY in
  app/widget/[token]/strings.ts keyed off navigator.language — deliberately
  not a translation call (no latency, no cost, no mistranslated button).
  The server-rendered greeting stays in the site's language because it
  quotes the site's own product names.
- 🟡 **The launcher colour needs the public config endpoint.** widget.js
  paints the bubble before the iframe exists, so it fetches
  /api/widget/{token}/config (cached 5 min, CORS-open, returns only
  enabled+accent). If that call fails the default gradient is already on
  screen — never block the launcher on it.

## Business plans — Free / Pro / Studio (added 2026-08-02)

- 🔴 **BEFORE PAID PLANS CAN SELL, Brandon must create four prices in
  Stripe LIVE mode** (Pro monthly + yearly, Studio monthly + yearly) and
  the four ids go in Vercel as STRIPE_PRO_MONTHLY_PRICE_ID,
  STRIPE_PRO_YEARLY_PRICE_ID, STRIPE_STUDIO_MONTHLY_PRICE_ID,
  STRIPE_STUDIO_YEARLY_PRICE_ID (non-sensitive). Until then the pricing
  page shows only the free card and checkout 503s — by design, no dead
  buttons. Watch the dashboard account-context trap documented in the
  Stripe memory: confirm the acct_ in the URL is LIVE.
- 🔴 **lib/billing/plans.ts is the only place a limit is defined.** Every
  gate reads it. Don't hardcode a number anywhere else, and don't gate the
  human handoff — a company out of AI answers must still collect leads.
- 🔴 **The webhook derives the plan from the subscription's PRICE**, not
  from metadata, so a portal-side switch lands correctly. An active
  subscription on an unknown price leaves the plan UNCHANGED and logs —
  never downgrade a paying customer because an env var is missing.
- 🟡 **STUDIO pools its AI budget on the Company row** (aiMonthKey /
  aiRepliesUsed); single-site plans still spend on WidgetSite. Two
  near-identical blocks in caps.ts on purpose — Prisma's delegates don't
  share a callable type and casting the client would be worse.
- 🟡 **Gating the digest changed existing behaviour**: a FREE company no
  longer receives the weekly email (verified: sent 0, skipped 1 on the
  pilot). Same for drafted replies, intake briefs, custom colour, and the
  Topezia line returning. Comp a customer by setting Company.plan = 'PRO'
  by hand — the same pattern the `branded` column used.
- 🟡 **STUDIO cannot yet be delivered**: WidgetSite.companyId is still
  @unique, so a company can only run one site. The plan is defined and
  priced but multi-site management (site switcher, per-site facts/stats,
  CompanyInquiry.siteId) is unbuilt — do not set a company to STUDIO and
  do not add its price id until that lands.
