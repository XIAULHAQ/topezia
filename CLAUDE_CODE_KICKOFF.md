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

Everything below was confirmed via direct database queries or live deploy checks, not just "should work":

| Layer | Status | Evidence |
|---|---|---|
| Schema (14 models, 12 enums) | ✅ Live in Supabase | Confirmed via row-count queries; verify migration history per §2 |
| pgvector + pg_trgm extensions | ✅ Enabled | Migration ran successfully |
| Taxonomy seed | ✅ Live: 8 verticals, 17 roles, 37 aliases, 27 skills | Verified via `SELECT COUNT(*)` on each table |
| App deployment | ✅ Live on Vercel, auto-deploys on push to `main` | Deployment `c7fc1ad` and later show "Ready" |
| Domain | ✅ `topezia.com` connected, DNS valid | Vercel domains page shows "Valid Configuration" |
| Founding-employer waitlist | ✅ Functional end-to-end | `/waitlist` form + `/admin/waitlist` dashboard both live |
| Ingestion pipeline | ⚠️ **Code exists, never run against real data** | Greenhouse/Lever/Ashby crawlers written, untested live |
| `Source` table | ⚠️ Empty | No companies queued for crawling yet |
| Feed UI, matching engine | ❌ Not built | Slice 3, not started |
| Parse-confirmation screen | ❌ Not built | Slice 3, not started |
| SEO pages, email alerts | ❌ Not built | Slice 4, not started |

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
- `README.md` — file-by-file map of what exists and what each piece does.
- This document — operational handoff notes, not product spec. Delete or
  archive once Slice 2–4 are underway and this context is no longer novel.
