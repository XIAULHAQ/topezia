# Runbook — Move the database to a US region

**Why:** the current Supabase project is in `ap-northeast-2` (Seoul), ~1.3s per
query for US users. A US-region Postgres drops that to ~50ms and makes the feed
(and ingestion) snappy. Supabase can't change a project's region in place, so
this creates a **new** US project and rebuilds on it.

**Approach:** rebuild fresh, don't copy. All current data is re-creatable
(taxonomy from the seed; jobs re-fetched from the ATS boards), so we run the
schema migrations + seed + a fresh ingest on the new DB. This avoids a
brittle cross-DB copy of `vector` embeddings, and ingestion runs fast on the
new US DB. (The only human-entered data is the one waitlist test row, which is
disposable.)

---

## Your part (Supabase dashboard — ~5 min)

1. Go to **https://supabase.com/dashboard** → **New project**.
2. Name it e.g. `topezia-us`. **Set a database password and save it.**
3. **Region: pick a US region** — `East US (North Virginia)` is a good default.
4. Create it and wait ~2 minutes for provisioning.
5. Open **Project Settings → Database → Connection string**. Copy two strings,
   replacing `[YOUR-PASSWORD]` with the password from step 2:
   - **Transaction pooler** (port `6543`) → this becomes `DATABASE_URL`
     (append `?pgbouncer=true` if it isn't there).
   - **Session pooler / Direct** (port `5432`) → this becomes `DIRECT_URL`.
6. Also copy, from **Project Settings → API**: the **Project URL** and the
   **anon / publishable key** (for `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
7. Paste all of these to me. I'll do the rest.

## My part (once I have the strings)

```bash
# point .env at the new US DB, then:
npx prisma migrate deploy          # builds the whole schema (7 migrations)
npm run db:seed                    # taxonomy: 10 verticals, 49 roles, 27 skills
npx tsx scripts/seed-sources.ts    # the 5 ATS boards
npx tsx scripts/run-ingestion.ts --max-jobs-per-source=10   # fresh jobs (fast on US DB)
npx tsx scripts/backfill-embeddings.ts                      # embeddings
```
Then I verify row counts + a match run, and confirm `migrate status` is clean.

## Final cutover (you, in Vercel — ~2 min)

1. Vercel → your Topezia project → **Settings → Environment Variables**.
2. Update `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the new US values.
3. **Redeploy** (Deployments → ⋯ → Redeploy) so the live site uses the new DB.

## Notes / risks
- `prisma migrate deploy` has never run against a fresh DB before (the Seoul DB
  was hand-built then baselined). If a `CREATE EXTENSION vector/pg_trgm` step
  fails on the new project, I'll enable those extensions first and re-run — a
  known, quick fix.
- Keep the old Seoul project around until the new one is verified live, then
  delete it to stop paying/for tidiness.
- The GitHub Actions cron secrets (`DATABASE_URL`, `DIRECT_URL`) also need the
  new values if/when scheduled ingestion is turned on.
