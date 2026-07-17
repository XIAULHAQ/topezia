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
- 🔴 **No live Lever source.** `leverdemo` was removed — it's Lever's own sample
  board, so it served fake postings ("Account Executive (copy)", four identical
  "Account Executive" rows) that reached a real alert email. The Lever crawler is
  verified working; it needs a **real** Lever board added to `seed-sources.ts`
  before launch. Current live sources: Greenhouse (dropbox, discord) + Ashby
  (posthog, linear) = 39 real jobs.
- 🟠 **The existing 39 jobs were extracted/embedded from noisy text.** Greenhouse
  returns entity-encoded HTML, which `stripHtml` didn't decode — so ~78% of each
  Greenhouse description fed to Haiku and the embedding model was raw markup and
  generated class attributes. Fixed now, but the stored jobs still carry the old
  text/skills/embeddings; the fresh ingest at launch resolves it. (Re-ingesting
  *before* clearing would duplicate them — the fix changes `descriptionHash`.)
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
- 🟡 **Signup emails are unverified** (confirm-email is off for a frictionless
  MVP), so people can register a typo'd or someone else's address. Turn "Confirm
  email" back on once a real email provider (Resend/Brevo, spec §9) is wired for
  Slice 4 alerts — Supabase's built-in free-tier email is too rate-limited to
  rely on.
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
- 🟢 **Test Profile rows cleared** from prod (0 profiles now).

## Slice 4 (spec §7–9)
- 🟢 **Programmatic SEO engine BUILT** (§7): `/jobs/{role|vertical}`,
  `/jobs/remote-{role}`, `/jobs/{role}/{state}`, the ≥5-live-jobs floor
  (auto-publish/unpublish, evaluated per request), `sitemap.xml` (self-pruning),
  `robots.txt`, JobPosting JSON-LD, the role↔state↔remote internal-link lattice,
  and absolute canonicals. Verified: 3 pages publish today (tech-software 24,
  sales 19, account-executive 13); thin ones correctly 404.
- 🟢 **`NEXT_PUBLIC_SITE_URL` is correct in Vercel** — verified: the live sitemap
  and robots.txt both emit `https://www.topezia.com`, the canonical host.
- 🟡 **Only 3 SEO pages exist until ingestion scales** — by design (the anti-thin
  rule). With 39 live jobs the publishing set is `/jobs/tech-software` (24),
  `/jobs/sales` (10) and `/jobs/account-executive` (5, i.e. one expiry from
  disappearing). Every other role/vertical/state 404s **correctly**. The launch
  target is 2–4k pages; that's gated on job volume, not code — so expect lots of
  404s on hand-typed /jobs/* URLs until then, and don't mistake them for bugs.
  (Anything that *links* to a hidden page is a bug — sitemap, sibling lattice and
  job breadcrumbs all check the floor before linking.)
- 🟢 **LLM page intros BUILT** (§7): `SeoPageIntro` cache (migration 008),
  `scripts/generate-page-intros.ts` (`npm run gen-intros`, `--dry-run/--force`),
  refreshed weekly by `page-intros-cron`. Copy is generated **out of band** — a
  page with no cached intro renders the templated fallback and never blocks on
  the model. The prompt is fed real counts/titles/companies and told not to
  invent facts; the intro also feeds each page's `<meta description>`, so search
  snippets are unique too. Verified live on all 4 publishable pages.
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
- 🔴 **Delete account does NOT delete the Supabase auth user.** It removes the
  profile and all its data, but the auth account survives (needs the
  service-role key, not wired). A signed-in user who "deletes" can still sign in
  to an empty state. True account deletion needs a server-role admin call.
- 🟡 **Still no logout / password-reset UI.** Auth exists (login works) but
  there's no sign-out button anywhere and no reset flow.