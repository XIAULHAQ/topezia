# Runbook — Baselining Prisma against an existing database

> **Reference only — already completed. Use if drift recurs.**
> This is not a task. The migration debt this procedure fixed was resolved in
> July 2026, and the current US-East database was rebuilt fresh from tracked
> migrations, so `prisma/migrations/` and the live schema already agree. Do not
> run any of this as part of onboarding. It is kept because the sequence was
> hard-won and is the recovery path the next time schema drift appears.

---

## When you actually need this

Reach for it when Prisma's migration history and the real database have
diverged — symptoms being any of:

- `prisma migrate status` reports migrations as pending that you know already
  ran, or reports drift it wants to reset.
- `prisma migrate dev` proposes to drop or recreate tables that exist and hold
  data.
- Tables or columns were created by hand in the Supabase SQL editor and never
  captured as a migration (the original cause here).

**Never** resolve drift by letting `migrate dev`/`migrate reset` rewrite the
live database. On this project that means data loss; hand-write the SQL, apply
it, then teach Prisma about it with `migrate resolve --applied`.

## The procedure

Prisma's own "baselining an existing database" workflow
(https://www.prisma.io/docs/guides/database/baselining), as adapted for this
repo:

```bash
# 1. Confirm your local Prisma CLI can actually reach its engines:
npx prisma --version

# 2. Generate a migration representing the FULL current schema.prisma as a
#    single baseline, without running it against the database (the tables
#    already exist — this just teaches Prisma's migration history about them):
mkdir -p prisma/migrations/00000000000000_init
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_init/migration.sql

# 3. Diff that generated file against whatever record exists of the SQL that
#    actually built production (here: prisma/manual-sql-log/01_base_schema.sql).
#    They should be equivalent — naming, ordering, or minor syntax may differ;
#    the DDL should match. If they diverge meaningfully, trust schema.prisma
#    and investigate why.

# 4. Mark the baseline as applied (it matches reality already — this just
#    records that fact in Prisma's _prisma_migrations table):
npx prisma migrate resolve --applied 00000000000000_init

# 5. Mark any permanently-manual migrations as applied too, since those also
#    already ran by hand:
npx prisma migrate resolve --applied 000_init_vector_support
npx prisma migrate resolve --applied 001_pg_trgm

# 6. Verify state is clean:
npx prisma migrate status
# Should show "Database schema is up to date"
```

## Why the vector migrations stay hand-written

`schema.prisma` deliberately **does not declare the embedding columns** —
they're commented out as `Unsupported("vector(1536)")` /
`Unsupported("vector(1024)")` (see `schema.prisma` around the `Job` and
`Profile` models). That means `000_init_vector_support`, `001_pg_trgm` and
`002_embedding_dim` were never meant to be derived from `schema.prisma`: they
are legitimately hand-written, permanently-manual migrations. This is a common
and accepted pattern for pgvector with Prisma, since Prisma's schema language
can't fully express vector columns yet. Don't try to fold them into a
schema-driven baseline.

The live tradeoff this creates is recorded in `CAVEATS.md` → Infrastructure &
database: a future `migrate dev` could try to drop the embedding columns unless
they're declared as `Unsupported(...)`.

## Historical record

- `prisma/manual-sql-log/` holds the exact SQL that originally built
  production by hand (`01_base_schema.sql`, `02_taxonomy_seed.sql`). It was
  never a tracked migration — it's a historical record, kept because it's the
  provenance of the first schema.
- The original migration debt: no committed base-table migration existed at
  all, while `000_init_vector_support` and `001_pg_trgm` both `ALTER`ed tables
  that, from Prisma's point of view, no migration in the repo had ever created.
  `migration_lock.toml` was also missing, because `migrate dev` had never run.
- An earlier version of the kickoff doc misdescribed this twice — claiming a
  `hand_written_init.sql` sat inside `prisma/migrations/` (it was never
  committed at all, confirmed via `git log --all`) and saying "16 tables" where
  the real count was 14 models / 12 enums at the time. Both were corrected in
  commit `5fa6fef`. The lesson is the convention now recorded in the kickoff
  doc: **trust the repo over the doc, and fix the doc.**
