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
| Schema (16 tables, 12 enums) | ✅ Live in Supabase | Confirmed via row-count queries |
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

**The problem:** the initial schema was applied by hand-writing raw SQL and
running it directly in Supabase's SQL editor, because this sandbox's network
whitelist blocked Prisma CLI's binary downloads (`binaries.prisma.sh` wasn't
reachable). That means:

- `prisma/migrations/` contains `000_init_vector_support/` and
  `001_pg_trgm/` (proper migration folders) plus a loose
  `hand_written_init.sql` file that is **not** a real Prisma migration —
  Prisma has no record of having applied it.
- If you run `prisma migrate dev` in a fresh environment, Prisma will try
  to create the base tables again and fail (they already exist), or get
  confused about migration state.

**The fix**, first thing in your first session:

```bash
# 1. Confirm your local Prisma CLI can actually reach its engines (it should,
#    outside the sandbox that authored this):
npx prisma --version

# 2. Baseline the existing schema as "already applied" so Prisma's migration
#    history matches reality. Easiest path: generate a proper initial
#    migration from the current schema.prisma, then mark it as applied
#    without re-running it (since the tables already exist):
npx prisma migrate dev --name init --create-only
# This creates prisma/migrations/<timestamp>_init/migration.sql from the
# CURRENT schema.prisma. Diff it against hand_written_init.sql — they should
# be equivalent (hand_written_init.sql was written to match schema.prisma
# exactly, but verify).

npx prisma migrate resolve --applied <timestamp>_init

# 3. Then mark the vector/trgm migrations as applied too, since those also
# already ran manually:
npx prisma migrate resolve --applied 000_init_vector_support
npx prisma migrate resolve --applied 001_pg_trgm

# 4. Verify state is clean:
npx prisma migrate status
# Should show "Database schema is up to date"

# 5. Delete hand_written_init.sql once the real migration folder replaces it
# (keep it in git history for reference, just remove from the working tree).
```

If `prisma migrate dev` produces SQL that doesn't match `hand_written_init.sql`
exactly, trust `schema.prisma` as the source of truth and investigate the
diff — it likely means a small drift crept in during the manual translation.

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
