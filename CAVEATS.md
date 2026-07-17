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

## Slice 4 (spec §7–9)
- 🟢 **Programmatic SEO engine BUILT** (§7): `/jobs/{role|vertical}`,
  `/jobs/remote-{role}`, `/jobs/{role}/{state}`, the ≥5-live-jobs floor
  (auto-publish/unpublish, evaluated per request), `sitemap.xml` (self-pruning),
  `robots.txt`, JobPosting JSON-LD, the role↔state↔remote internal-link lattice,
  and absolute canonicals. Verified: 3 pages publish today (tech-software 24,
  sales 19, account-executive 13); thin ones correctly 404.
- 🔴 **`NEXT_PUBLIC_SITE_URL` must be updated in Vercel** to
  `https://www.topezia.com` (it's still `https://topezia.com`, which 308-redirects
  to www). Until then, production canonicals and every sitemap URL point at the
  non-canonical host.
- 🟡 **Only 3 SEO pages exist until ingestion scales** — by design (the anti-thin
  rule). With 39 live jobs the publishing set is `/jobs/tech-software` (24),
  `/jobs/sales` (10) and `/jobs/account-executive` (5, i.e. one expiry from
  disappearing). Every other role/vertical/state 404s **correctly**. The launch
  target is 2–4k pages; that's gated on job volume, not code — so expect lots of
  404s on hand-typed /jobs/* URLs until then, and don't mistake them for bugs.
  (Anything that *links* to a hidden page is a bug — sitemap, sibling lattice and
  job breadcrumbs all check the floor before linking.)
- 🟡 **Page intros are templated, not LLM-written** (§7 wants a cached, monthly-
  regenerated LLM intro per page so pages aren't near-duplicates). Fine at 3
  pages; needed before publishing thousands.
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
- 🟡 **`RESEND_API_KEY` / `ALERT_FROM_EMAIL` also need adding to Vercel** —
  they're only in local `.env`, so the live alert-signup form can't send its
  confirmation email yet.
- 🟡 **No alert email has ever actually been sent** — verified by dry-run only,
  since sending real email needs the verified domain + the owner's go-ahead.
- 🟡 CPC-feed monetization (Talent.com / Jooble / Appcast) + affiliate slots —
  not started; needs external feed accounts.
