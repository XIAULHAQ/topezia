# Topezia — Slice 1: Foundation

This is the Slice 1 scaffold from `topezia-phase1-spec.md` §10:
> Schema, taxonomy seed, auth, URL architecture, `/go/` route.

## What's here

| File | Spec section | What it does |
|---|---|---|
| `prisma/schema.prisma` | §3.1, §3.3, §3.4, §8 | Full canonical job schema, taxonomy, profile schema, waitlist |
| `prisma/migrations/000_init_vector_support/` | §3.1, §5 | Enables pgvector, adds embedding columns Prisma can't type natively |
| `prisma/seed.ts` | §2, §3.3 | Starter taxonomy: 4 deep verticals + 4 breadth, ~17 roles, ~25 skills |
| `app/api/go/[jobId]/route.ts` | §6.3 | Click-tracking redirect — the revenue + ranking signal in one route |
| `app/waitlist/page.tsx` | §8 | Public founding-employer signup form |
| `app/api/waitlist/route.ts` | §8 | Saves signup, enforces the 100-founding-member cap, creates an ingestion `Source` |
| `app/admin/waitlist/page.tsx` | §8 | Admin CMS — signup stats, by-vertical breakdown, recent signups table |
| `app/api/admin/waitlist-stats/route.ts` | §8 | Data the admin page reads, token-protected |
| `lib/admin-auth.ts` | — | MVP token-based admin auth (see file comment for the Phase 2 upgrade path) |
| `lib/prisma.ts` | — | Prisma client singleton (Next.js hot-reload safe) |

### Using the waitlist + admin CMS

1. Deploy, then visit `/waitlist` — this is the public founding-employer form. Every submission is saved to `WaitlistSignup` **and** creates a linked `Source` row (`isPriority = true`), so signups double as Slice 2 ingestion targets automatically — no manual copy-paste later.
2. Set `ADMIN_ACCESS_TOKEN` in your env to any long random string.
3. Visit `/admin/waitlist?token=YOUR_TOKEN` once — this sets a cookie so you can bookmark the plain `/admin/waitlist` URL afterward.
4. The dashboard shows: total signups, founding-member count vs the 100 cap (and slots remaining), a breakdown by vertical, and the 20 most recent signups with their careers page links.

The 100-cap is enforced **server-side** in `app/api/waitlist/route.ts`, not just in the landing copy — submission #101 still saves (you never lose a lead) but comes back `isFoundingMember: false`.

## Slice 2 — Ingestion (spec §4)

| File | What it does |
|---|---|
| `lib/ingestion/sources/{greenhouse,lever,ashby}.ts` | Crawlers for the three cheapest ATS boards (§4.1) |
| `lib/ingestion/normalize-rules.ts` | Rung 1 of the cost ladder — regex extraction for salary, location, employment type, remote type (§4.2) |
| `lib/ingestion/llm-extract.ts` | Rung 2 — Haiku-class model fills what rules couldn't, cached by description hash |
| `lib/ingestion/resolve-taxonomy.ts` | Maps raw titles/skills onto canonical Role/Skill ids via the alias tables; the alias table grows itself as new titles resolve |
| `lib/ingestion/embed.ts` | Job embeddings via Voyage AI (Anthropic's recommended embedding partner) |
| `lib/ingestion/dedupe.ts` | Three-rule dedup cascade from §4.3 (hash match → fuzzy title → embedding similarity) |
| `lib/ingestion/expiry.ts` | Freshness checking from §4.4 — two-step dead-link confirmation before marking EXPIRED |
| `scripts/run-ingestion.ts` | Orchestrator — run with `npm run ingest` |
| `scripts/run-expiry-check.ts` | Run with `npm run expiry-check` |
| `.github/workflows/*.yml` | **Free scheduled cron** for both scripts via GitHub Actions |

### Why GitHub Actions instead of a paid worker

Crawling multiple sources with LLM calls will exceed Vercel's serverless timeout (10s on the free tier). Rather than pay for a Railway/Render worker just to run a script on a timer, `.github/workflows/` runs `npm run ingest` and `npm run expiry-check` on a schedule using GitHub's free Actions minutes (2,000/month on a private repo — comfortably enough for twice-daily ingestion). Add your `.env` values as **repository secrets** (Settings → Secrets and variables → Actions), matching the names in the workflow files.

### Before running this for real

- **Populate the `Source` table first.** `npm run ingest` reads from `Source` — it doesn't discover company boards on its own. Founding-employer waitlist signups populate this automatically; for volume beyond that, you'll want a separate one-time script that compiles Greenhouse/Lever/Ashby company slugs from public directories (YC directory, etc.) and inserts them as `Source` rows. Not built yet — worth its own session.
- **Verify the Ashby response shape against a live board before trusting it.** Flagged in the file itself — Ashby's public API has changed shape before; the other two ATS integrations are stable and well-documented.
- **`companyName` extraction is a stub right now** — it falls back to the careers-page domain. Most ATS responses include a real company name field; wiring that up properly is a fast follow, not a redesign.
- **Rule (c) of dedup (embedding-similarity duplicates)** depends on both jobs already having embeddings, so it only catches duplicates ingested after the first one has been embedded — fine at Phase 1 volume, just don't expect same-run duplicate catches on rule (c) alone.

## What's NOT here yet (still Slice 2–3)

- Workable and SmartRecruiters crawlers (needed for the healthcare vertical, §4.1)
- Adzuna/Jooble aggregator API integration (breadth tier + trucking CPC)
- A `Source`-table seeding script beyond the waitlist form
- Auth pages (sign up / log in) for job-seeker accounts — Supabase Auth UI or custom, your call
- Parse-confirmation screen and feed UI — Slice 3
- Email notification to you when a new founding-employer signs up (easy add: fire a webhook/email from `app/api/waitlist/route.ts` once you've picked an email provider, per spec §9)

## Setup

1. **Create a Supabase project** (free tier). In the SQL editor, confirm `vector` extension is available (Supabase enables it by default — the migration below just makes sure).

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Copy env template and fill in your Supabase + Anthropic keys:**
   ```bash
   cp .env.example .env
   ```

4. **Run the base migration, then the vector migration:**
   ```bash
   npx prisma migrate dev --name init
   # then apply prisma/migrations/000_init_vector_support/migration.sql
   # via the Supabase SQL editor (Prisma won't run raw `vector` DDL for you
   # on the free-tier pooled connection — direct paste is simplest here)
   ```

5. **Seed the taxonomy:**
   ```bash
   npm run db:seed
   ```

6. **Run locally:**
   ```bash
   npm run dev
   ```

## Deploying

Push to GitHub, import into Vercel, add the same env vars in Vercel's project settings. `DATABASE_URL` must be the **pooled** connection string for the serverless runtime — the direct one will exhaust connections under load.

### Connecting topezia.com

1. In the Vercel project → **Settings → Domains**, add `topezia.com` and `www.topezia.com`.
2. Vercel gives you DNS records to add at your registrar (an `A` record for the apex domain, a `CNAME` for `www`). Add those, then wait for propagation (usually minutes, occasionally longer).
3. Set `NEXT_PUBLIC_SITE_URL=https://topezia.com` in Vercel's env vars (already in `.env.example`).
4. **Email sending domain (do this before Slice 4's alert emails go out):** whichever provider you pick (Resend or Brevo per spec §9), verify `topezia.com` as a sending domain — this means adding SPF/DKIM DNS records they'll give you. Sending alert emails from an unverified domain gets flagged as spam almost immediately, so this is worth doing early rather than discovering it the week you launch alerts.
5. The founding-employer waitlist link you send in outreach (spec §8) should point to `https://topezia.com/waitlist` once the domain is live — update the `[waitlist link]` placeholder in your outreach drafts.

## Working method (spec §10)

One module per Claude Code session. When you open the next session, paste the relevant spec section (e.g. §4 for the Greenhouse crawler) plus this README so the assistant knows what already exists and doesn't redefine the schema. If something in the build contradicts the spec, fix the spec first — it's the source of truth, not this code.
