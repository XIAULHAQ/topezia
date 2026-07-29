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
kickoff doc for exactly what's done vs. pending. Start by reconciling
Prisma's local migration history with the live database (see the
"Prisma migration debt" section) before writing any new code.
```

---

## 1. Current state — verified, not assumed

**Reconciled 2026-07-30 against the repo at commit `52dbe29`** (243 commits,
migrations through `041_company_logo`). The table below had gone badly stale —
it was last accurate on 2026-07-16 and claimed Slices 3–4 were unbuilt. What
follows is **code-verified only**: every "Evidence" cell names a file, migration,
or committed record that was read during this pass. Rows whose truth lives in the
live database are marked ⚪ and were *not* queried — do not treat them as
confirmed.

| Layer | Status | Evidence (repo-verified unless marked ⚪) |
|---|---|---|
| Schema | ✅ **31 models, 27 enums** (was 14/12) | `grep -c '^model\|^enum' prisma/schema.prisma` |
| Prisma migration debt | ✅ **Resolved — §2 and §3 item 1 of this doc are obsolete; skip them** | 42 tracked folders + `migration_lock.toml`; the US-East DB was rebuilt fresh from migrations, not hand-run SQL (CAVEATS → Infrastructure) |
| pgvector + pg_trgm | ✅ Enabled; embedding cols still raw-migration-managed | `000_init_vector_support`, `001_pg_trgm`, `002_embedding_dim`; `schema.prisma:203,410` keep them commented |
| Taxonomy seed | ✅ **11 verticals, 50 roles, 131 aliases, 27 seed skills** (was 8/17/37/27) | `prisma/seed.ts`; ingestion coins further unreviewed skills (`019_skill_tier`) |
| Ingestion pipeline | ✅ **Run repeatedly against real data** — not "never run" | 128 entries in `scripts/seed-sources.ts`; 6 cron workflows in `.github/workflows/`; commits `9846309` (first full crawl), `8f9bb3b` (US expansion) |
| `Source` table | ⚪ Populated by `seed-sources.ts`; live row count not queried | `scripts/seed-sources.ts` exists and is committed |
| Feed UI | ✅ Built | `app/feed/`, `app/jobs/`, `app/search/` |
| Matching engine | ✅ Built | `lib/matching/{match,insights,parse-resume,eligibility}.ts`, `app/api/match/`, `004_match_cache` |
| Parse-confirmation screen | ✅ Built | `app/onboard/page.tsx`, `app/api/parse/` |
| SEO pages | ✅ Built (spec §7) — but see gaps row | `app/jobs/[slug]/[place]/`, `app/sitemap.ts`, `app/robots.ts`, `lib/seo/` (9 modules), `008_seo_page_intro` |
| Email alerts | ✅ Built, incl. double opt-in + RFC 8058 unsubscribe | `lib/alerts/`, `scripts/send-alerts.ts`, migrations `006`/`007`, `alerts-cron.yml` |
| Slice 4 gaps vs. the SEO addendum | ❌ `page_stats` aggregates, thin-content `noindex` gate, on-demand revalidation | No `page_stats` anywhere in repo; hubs use time-based `revalidate = 3600`; thin pages currently **404** where `docs/topezia-slice4-seo-spec.md` §1.2 requires `noindex,follow` |
| Shipped well beyond Phase 1 | ✅ Employer dashboard, billing/Stripe, portfolio, blog, career coach, endorsements, publications, freelance projects, resume tooling | migrations `018`–`041`; `app/employer/`, `app/pricing/`, `app/portfolio/`, `app/blog/`, `app/coach/` |
| Founding-employer waitlist | ✅ Functional; **admin moved to `/hq`**, `/admin/waitlist` no longer exists | `app/waitlist/`, `app/api/waitlist/`, `app/hq/hq-dashboard.tsx:61` (waitlist tab) |
| App deployment | ⚪ Assumed still live on Vercel, auto-deploy on `main` | Carried over from 2026-07-16; not re-verified in this pass |
| Domain | ⚪ `topezia.com` connected; canonical host is `www.topezia.com` | Carried over; CAVEATS → Slice 4 confirms the `www` canonical as of 2026-07-18 |
| Live row counts (jobs, publishable pages) | ⚪ **Not verified — needs `DATABASE_URL`** | Last committed figures (39 live jobs, 3–4 publishable SEO pages) are from CAVEATS as of **2026-07-18** and are stale by construction |

---

## 2. Prisma migration debt — fix this FIRST

**Corrected account** (an earlier version of this doc got this wrong — the
paragraph below reflects what's actually true, verified against `git log`
and the live schema, not what was assumed):

- There is **no committed base-table migration at all**, in git or
  otherwise. The SQL that actually created the 14 models / 12 enums was
  run by hand in Supabase's SQL editor and was never committed to this
  repo. It now lives at `prisma/manual-sql-log/01_base_schema.sql` — a
  **historical record of what was actually executed**, not a real Prisma
  migration. Same for `prisma/manual-sql-log/02_taxonomy_seed.sql` (the
  taxonomy seed data — also run by hand, also never a tracked migration).
- The only two real migration folders that exist —
  `000_init_vector_support` and `001_pg_trgm` — both `ALTER` tables
  (`Job`, `Profile`) that, from Prisma's point of view, were never created
  by any migration in this repo's history. If you ran `prisma migrate
  deploy` on a fresh database right now, it would fail immediately.
- `prisma/migrations/migration_lock.toml` was missing (Prisma generates
  this automatically the first time `migrate dev` runs; since that never
  happened here, it never existed). Added now with `provider = "postgresql"`.
- `schema.prisma` **does not declare the embedding columns** — they're
  commented out as `Unsupported("vector(1536)")`. This actually matters for
  the fix below: it means `000_init_vector_support` and `001_pg_trgm` were
  never meant to be derived from `schema.prisma` in the first place. They're
  legitimately hand-written, permanently-manual migrations (a common,
  accepted pattern for pgvector with Prisma, since Prisma's schema language
  can't fully express vector columns yet) — not something to fold into a
  schema-driven baseline.

**The correct fix** — Prisma's own "baselining an existing database" workflow
(see https://www.prisma.io/docs/guides/database/baselining), adapted here:

```bash
# 1. Confirm your local Prisma CLI can actually reach its engines (it
#    should, outside the sandbox that authored this doc):
npx prisma --version

# 2. Generate a migration representing the FULL current schema.prisma
#    (14 models, 12 enums — no vector columns, since those aren't in
#    schema.prisma) as a single baseline, without running it against the
#    database (the tables already exist — this just teaches Prisma's
#    migration history about them):
mkdir -p prisma/migrations/00000000000000_init
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_init/migration.sql

# 3. Diff that generated file against prisma/manual-sql-log/01_base_schema.sql
#    — they represent the same 14 models/12 enums and should be equivalent
#    (naming, ordering, or minor syntax may differ; the DDL should match).
#    If they diverge meaningfully, trust schema.prisma and investigate why.

# 4. Mark the baseline as applied (it matches reality already — this just
#    records that fact in Prisma's _prisma_migrations table):
npx prisma migrate resolve --applied 00000000000000_init

# 5. Now mark the two vector/trgm migrations as applied too, since those
#    also already ran manually and sort after the baseline alphabetically:
npx prisma migrate resolve --applied 000_init_vector_support
npx prisma migrate resolve --applied 001_pg_trgm

# 6. Verify state is clean:
npx prisma migrate status
# Should show "Database schema is up to date"
```

After this, `prisma/migrations/` will contain three real, tracked folders
(`00000000000000_init`, `000_init_vector_support`, `001_pg_trgm`) plus
`migration_lock.toml` — a fully honest migration history matching what's
actually in the database. From that point forward, `prisma migrate dev`
works normally for new changes.

`prisma/manual-sql-log/` can stay as a permanent historical record (it's
genuinely useful — it's the exact SQL that built production) or be deleted
once the baseline migration is verified equivalent; your call.

---

## 2a. What was corrected in this doc

An earlier version of this document claimed `hand_written_init.sql` was
sitting inside `prisma/migrations/` and suggested treating it as a
quasi-migration to resolve directly. That was wrong on two counts: the file
was never committed to git at all (confirmed via `git log --all`), and even
if it had been, it wasn't in a real migration folder Prisma would recognize.
It also said "16 tables" where the actual count is 14 models / 12 enums.
Both errors are fixed above. If anything else in this doc turns out to be
inaccurate when you check it against reality, trust the repo over the doc
and fix the doc.

---

## 3. Immediate next priorities, in order

1. **Fix the Prisma migration debt** (above) before writing any new code —
   otherwise every future `prisma migrate dev` is unreliable.
2. **Populate the `Source` table for real.** The waitlist form creates
   `Source` rows automatically, but it's empty until real founding-employer
   signups come in. For testing ingestion, manually insert a few known
   Greenhouse/Lever company slugs (e.g. `stripe`, `airbnb` on Greenhouse —
   verify current slugs, these change) via Prisma Studio or a seed script.
3. **Run `npm run ingest` against real data** and see what breaks. The
   crawlers were written carefully but never executed — expect some bugs.
   Check `lib/ingestion/sources/ashby.ts` first; its response shape was
   flagged in the file comments as the least-verified of the three.
4. **Slice 3: parse-confirmation screen + feed UI.** These are designed in
   detail in `topezia-phase1-spec.md` §6 — two Visualizer mockups exist
   from earlier design work (feed-first layout, parse-confirmation screen)
   that can guide the real implementation.
5. **Wire up the matching engine** (§5 of the spec) — retrieval via pgvector
   cosine similarity, rerank via Haiku-class model, honest scoring rules.

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
- `README.md` — file-by-file map of what exists and what each piece does.
- This document — operational handoff notes, not product spec. Delete or
  archive once Slice 2–4 are underway and this context is no longer novel.
