# Topezia — Claude Code Kickoff

**Read this first, in a fresh Claude Code session, before touching anything.**
This is the handoff from browser-based setup (schema, deployment, taxonomy) to
real local development (Slices 2–4: ingestion, feed UI, matching, SEO).

---

## 0. What to paste as your first message to Claude Code

```
I'm continuing the Topezia project (AI job-matching platform). Repo:
https://github.com/XIAULHAQ/topezia — clone it and read README.md and
CLAUDE_CODE_KICKOFF.md first, then topezia-phase1-spec.md for the full
Phase 1 spec. The database schema, deployment, and taxonomy are already
live in production (Supabase + Vercel) — see "Current state" in the
kickoff doc for exactly what's done vs. pending, and treat that table as
authoritative over any older prose in the doc. Don't start by fixing
anything; read the table first and tell me what you think the next step
is before writing code.
```

---

## 1. Current state — verified, not assumed

**Reconciled 2026-07-30** against the repo at migration `041_company_logo`, and
against the live database by direct query. The table had gone badly stale — it was
last accurate on 2026-07-16 and claimed Slices 3–4 were unbuilt. Every "Evidence"
cell names a file, migration, committed record, or query run during this pass; a
⚪ row was *not* verified and must not be treated as confirmed. Row counts are
snapshots — re-query rather than quoting them later.

| Layer | Status | Evidence (repo-verified unless marked ⚪) |
|---|---|---|
| Schema | ✅ **31 models, 27 enums** (was 14/12) | `grep -c '^model\|^enum' prisma/schema.prisma` |
| Prisma migration debt | ✅ **Resolved** — procedure archived to `docs/runbooks/prisma-baseline.md`, reference-only | 42 tracked folders + `migration_lock.toml`; the US-East DB was rebuilt fresh from migrations, not hand-run SQL (CAVEATS → Infrastructure) |
| pgvector + pg_trgm | ✅ Enabled; embedding cols still raw-migration-managed | `000_init_vector_support`, `001_pg_trgm`, `002_embedding_dim`; `schema.prisma:203,410` keep them commented |
| Taxonomy seed | ✅ **11 verticals, 50 roles, 131 aliases, 27 seed skills** (was 8/17/37/27) | `prisma/seed.ts`; ingestion coins further unreviewed skills (`019_skill_tier`) |
| Ingestion pipeline | ✅ **Run repeatedly against real data** — not "never run" | 128 entries in `scripts/seed-sources.ts`; 6 cron workflows in `.github/workflows/`; commits `9846309` (first full crawl), `8f9bb3b` (US expansion) |
| `Source` table | ✅ **128 sources** (88 Greenhouse, 36 Ashby, 4 Lever), none never-crawled | Queried 2026-07-30; `scripts/seed-sources.ts` |
| Feed UI | ✅ Built | `app/feed/`, `app/jobs/`, `app/search/` |
| Matching engine | ✅ Built | `lib/matching/{match,insights,parse-resume,eligibility}.ts`, `app/api/match/`, `004_match_cache` |
| Parse-confirmation screen | ✅ Built | `app/onboard/page.tsx`, `app/api/parse/` |
| SEO pages | ✅ Built (spec §7) — but see gaps row | `app/jobs/[slug]/[place]/`, `app/sitemap.ts`, `app/robots.ts`, `lib/seo/` (9 modules), `008_seo_page_intro` |
| Email alerts | ✅ Built, incl. double opt-in + RFC 8058 unsubscribe | `lib/alerts/`, `scripts/send-alerts.ts`, migrations `006`/`007`, `alerts-cron.yml` |
| Slice 4 gaps vs. the SEO addendum | ❌ `page_stats` aggregates, on-demand revalidation. ✅ thin-content `noindex` gate (§1.2) landed 2026-07-30 | No `page_stats` anywhere in repo; hubs still use time-based `revalidate = 3600`. Gate: per-kind floors in `lib/seo/pages.ts`, `SeoPage.thin` → `noindex,follow` + alert state |
| Shipped well beyond Phase 1 | ✅ Employer dashboard, billing/Stripe, portfolio, blog, career coach, endorsements, publications, freelance projects, resume tooling | migrations `018`–`041`; `app/employer/`, `app/pricing/`, `app/portfolio/`, `app/blog/`, `app/coach/` |
| Founding-employer waitlist | ✅ Functional; **admin moved to `/hq`**, `/admin/waitlist` no longer exists | `app/waitlist/`, `app/api/waitlist/`, `app/hq/hq-dashboard.tsx:61` (waitlist tab) |
| App deployment | ⚪ Assumed still live on Vercel, auto-deploy on `main` | Carried over from 2026-07-16; not re-verified in this pass |
| Domain | ⚪ `topezia.com` connected; canonical host is `www.topezia.com` | Carried over; CAVEATS → Slice 4 confirms the `www` canonical as of 2026-07-18 |
| Live row counts | ✅ **13,556 live jobs + 928 projects; 456 sitemap URLs** | Queried 2026-07-30. The old "39 jobs / 3 SEO pages" figures were ~350× low. Any count here is a snapshot — re-query, don't quote |

---

## 2. Conventions that keep this doc trustworthy

These exist because this doc has already rotted twice — once on the migration
facts (corrected 2026-07-16), once wholesale when the Current-state table went
on claiming Slices 3–4 were unbuilt for two weeks after they shipped
(reconciled 2026-07-30). Both times the cost was paid by whoever read it next.

1. **Any session that ships a feature updates `CAVEATS.md` in the same commit.**
   Not "later", not a follow-up commit. `CAVEATS.md` is the highest-trust doc in
   the repo *because* it's been maintained; it stops being that the moment it
   lags. This is the cheapest rule here and the one that matters most.
2. **Trust the repo over the doc, then fix the doc.** If anything in this
   document contradicts what you find in the code, the code wins — and updating
   the doc in that same session is part of the task, not optional cleanup.
3. **§1's table is authoritative over any prose in this doc.** Prose here ages
   badly; the table carries per-row provenance and a reconciliation date.
4. **Never resolve schema drift by letting `migrate dev` / `migrate reset`
   rewrite the live database.** Hand-write the SQL, apply it, then record it
   with `prisma migrate resolve --applied`. See
   `docs/runbooks/prisma-baseline.md`.

### Migration debt: resolved, don't re-do it

The Prisma migration debt this section used to describe **is fixed**. The
current US-East database was rebuilt fresh from tracked migrations, so
`prisma/migrations/` (42 folders + `migration_lock.toml`) and the live schema
already agree. `prisma migrate dev` works normally for new changes.

The baselining procedure that fixed it — plus the full historical account of
what was wrong and the two documentation errors made along the way — now lives
in **`docs/runbooks/prisma-baseline.md`**, labeled reference-only. Read it if
drift ever recurs. Do not run it as onboarding.

---

## 3. Immediate next priorities, in order

**Rewritten 2026-07-30.** All five items this list used to hold (fix migration
debt, populate `Source`, first ingestion run, Slice 3 parse-confirmation + feed,
wire up matching) are **done** — see §1. The list below is derived from
`docs/topezia-slice4-seo-spec.md` §5 and the 🔴/🟠 items in `CAVEATS.md`, not
from the original Phase 1 plan. Re-derive it the same way when it goes stale.

1. **Slice 4 SEO addendum, in its own §5 order.** Item 1 (`JobPosting` + expiry
   handling) is already built, so the open work starts at item 2:
   `page_stats` computation at the end of each ingestion run → per-page stats
   blocks on programmatic pages → on-demand revalidation replacing the current
   time-based `revalidate = 3600` → remaining site-level schema (`Organization`,
   `WebSite`/`SearchAction`). Don't ship stats blocks before `page_stats` exists.
2. **Verify `mail.topezia.com` in Resend** — 🔴 in `CAVEATS.md` → Slice 4, and the
   hardest blocker left: no alert email can send at all until the domain is added
   at https://resend.com/domains and its DNS records published. Founder action.
   Everything else in the alerts pipeline is built and proven.
3. **Switch Ashby to `descriptionHtml` at the next full re-ingest** — 🟠 in
   `CAVEATS.md`. `sources/ashby.ts:47` still prefers `descriptionPlain`, so detail
   pages lose lists and headings. Deferred to a re-ingest on purpose: the change
   re-hashes every Ashby job and would otherwise duplicate ~3.2k of them.
4. **Google Search Console** — founder action, see §4.

---

## 4. Environment setup for local dev

Copy `.env.example` to `.env` and fill in real values. The Supabase project
is `olyftmcabrquebnrgtrf` — get connection strings and API keys from
`https://supabase.com/dashboard/project/olyftmcabrquebnrgtrf/settings`.

**You'll need to add two things not in the original `.env.example`:**
- `VOYAGE_API_KEY` — not yet obtained; sign up at voyageai.com if embeddings
  work is next.
- `SUPABASE_SERVICE_ROLE_KEY` — not yet plugged in anywhere; get from
  Supabase API settings when a worker script needs elevated access.

**GitHub Actions secrets** (for `.github/workflows/ingest-cron.yml` and
`expiry-cron.yml` to work): add `DATABASE_URL`, `DIRECT_URL`,
`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` as repository secrets
(Settings → Secrets and variables → Actions) — these are separate from
Vercel's env vars and haven't been set up yet.

**Also still pending:** the two GitHub Actions workflow files were never
successfully pushed (the PAT used lacked `workflow` scope). Add them via
GitHub's web UI (Add file → Upload files) or push with a token that has
Workflows: Read and write permission.

**Google Search Console — founder action, not something Claude Code can do**
(required by `docs/topezia-slice4-seo-spec.md` §4). Two steps, and they
unblock at different times:
- **Verify the `topezia.com` domain** — do this now; it doesn't depend on any
  Slice 4 code. DNS TXT record via the Vercel-managed nameservers, or the
  HTML-file method.
- **Submit the sitemap index** (`https://topezia.com/sitemap.xml`) — only
  after Slice 4 item 4 (sitemaps + on-demand revalidation) actually ships.
  Submitting a 404 sitemap logs a fetch error against the property.

---

## 5. Things that will bite you if you don't know about them

- **Vercel's Hobby tier serverless functions time out at 10s.** Never wire
  `npm run ingest` or `npm run expiry-check` into a Vercel API route — they
  must run via GitHub Actions (already set up) or a separate worker, not
  as a Vercel function.
- **Prisma's JSON fields need explicit `Prisma.InputJsonValue` casts** —
  bit us once already in `verticalFields`. `Record<string, unknown>` is not
  directly assignable.
- **`groupBy` orderBy on `_count` must reference an actual non-nullable
  model field**, not `_all` and not a nullable grouped field. See
  `app/api/admin/waitlist-stats/route.ts` for a working example (orders by
  `id`).
- **Tables created via raw SQL don't automatically grant the `anon` role
  read access** the way Supabase's dashboard UI does. If you add new tables
  by hand again (you shouldn't need to after fixing migration debt), remember
  this or REST API reads will silently return empty results.
- **Root React namespace types need explicit imports** — `React.FormEvent`,
  `React.CSSProperties` etc. fail Next.js's build-time type check unless
  you `import type { FormEvent, CSSProperties } from "react"` explicitly.
  Already fixed everywhere it existed, but worth knowing for new files.

---

## 6. Source documents to reference

- `topezia-phase1-spec.md` — the master spec, source of truth for product
  decisions. Update it when reality contradicts it.
- `docs/topezia-slice4-seo-spec.md` — Slice 4 SEO work must follow this
  addendum; it supersedes the lighter SEO notes in the base spec.
- `CAVEATS.md` — the running honest list of what's incomplete or fragile,
  with 🔴/🟠/🟡 severity. Highest-trust doc in the repo; keep it that way
  (§2 convention 1).
- `docs/runbooks/prisma-baseline.md` — reference-only recovery procedure for
  Prisma schema drift. Already completed; don't run it as onboarding.
- `README.md` — file-by-file map of what exists and what each piece does.
- This document — operational handoff notes, not product spec. Delete or
  archive once Slice 2–4 are underway and this context is no longer novel.
