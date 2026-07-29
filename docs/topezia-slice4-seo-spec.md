# Topezia — Slice 4 SEO Spec Addendum

> **Status:** Addendum to `topezia-phase1-spec.md`. Supersedes any lighter SEO notes in the base spec for Slice 4.
> **Purpose:** Programmatic SEO pages must ship with (a) per-page aggregate stats and (b) `JobPosting` structured data, or they will be treated by Google as thin content and won't rank. This doc specifies both precisely so Claude Code can implement without ambiguity.

---

## 1. Programmatic page generation

### 1.1 URL structure

Generate pages from the existing taxonomy (8 verticals, 17 roles, aliases table for redirects):

| Pattern | Example | Source |
|---|---|---|
| `/jobs/[role-slug]` | `/jobs/graphic-designer` | roles table |
| `/jobs/[role-slug]/[location-slug]` | `/jobs/graphic-designer/austin-tx` | roles × distinct job locations |
| `/jobs/remote/[role-slug]` | `/jobs/remote/frontend-developer` | roles, filtered `is_remote = true` |
| `/jobs/[vertical-slug]` | `/jobs/healthcare` | verticals table |

Rules:

- **Slugs are canonical taxonomy slugs**, not raw job-title strings. Role aliases 301-redirect to the canonical role slug (e.g., `/jobs/ui-designer` → `/jobs/graphic-designer` if aliased). Never generate duplicate pages per alias.
- **Location slugs** are `city-statecode` (lowercase, hyphenated). Derive from normalized job locations, not free-text. Maintain a `locations` lookup (city, state, slug) populated during ingestion.
- All URLs lowercase, no trailing slash. Enforce via middleware redirect.

### 1.2 Page-creation gate (thin-content protection)

A page is generated/indexable **only if it meets a minimum active-listing threshold**:

- Role pages: ≥ 5 active listings
- Role × location pages: ≥ 3 active listings
- Remote role pages: ≥ 3 active listings
- Vertical pages: always generated (they aggregate roles)

Below threshold:
- Do not link to the page from sitemaps or internal navigation.
- If the URL is hit directly, render it with `<meta name="robots" content="noindex,follow">` and a friendly "few listings right now — set an alert" state (this doubles as email-alert capture).
- Re-evaluate thresholds on each ingestion run; pages flip between indexable/noindex automatically. Never 404 a previously-indexed page while it has ≥ 1 listing.

### 1.3 Rendering strategy (Vercel free-tier friendly)

- Use **ISR (Incremental Static Regeneration)** with `revalidate` = 21600 (6h), or revalidate-on-demand triggered at the end of each GitHub Actions ingestion run via `res.revalidate()` / `revalidatePath()` webhook. Prefer on-demand: it's free-tier compatible and keeps `datePosted`/counts fresh without cron-heavy rebuilds.
- Do **not** SSR these pages per-request (function invocation costs at scale).
- `generateStaticParams` should pre-build only pages above the indexing threshold; long-tail renders on first hit.

---

## 2. Per-page aggregate stats (the ranking differentiator)

Every indexable programmatic page MUST render a stats block computed from ingested listings. This is what makes the page "real content" rather than a listings dump. All stats come from the extraction pipeline output — no new data collection required.

### 2.1 Required stats per page

Scope = the page's filter (role, role×location, remote×role, or vertical). Computed over **active listings only**, refreshed each ingestion run.

1. **Active listing count** — "142 graphic designer jobs in Austin"
2. **Salary/rate distribution** — median + p25–p75 range, split by pay type (hourly vs annual) where both exist. Only show if ≥ 5 listings have extracted pay data; otherwise omit the block entirely (never show "N/A").
3. **Top 5 in-demand skills** — frequency count of extracted skill IDs across listings in scope, joined to the skills table for display names.
4. **Employment-type breakdown** — % full-time / contract / part-time.
5. **Remote share** — % of listings marked remote (location pages only).
6. **Freshness line** — "Updated <date of last ingestion run>". Machine-readable too (see §3.4).

### 2.2 Implementation

- Precompute into a `page_stats` table (or materialized view) keyed by `(page_type, role_id, location_id nullable)` at the end of each ingestion run — do NOT aggregate at request time.
- Suggested columns: `listing_count`, `median_pay`, `p25_pay`, `p75_pay`, `pay_type`, `pay_sample_size`, `top_skills jsonb`, `emp_type_breakdown jsonb`, `remote_share`, `computed_at`.
- Stats block renders server-side in the initial HTML (crawlable), not client-fetched.

### 2.3 Copy guardrails

- Frame stats neutrally: market data, not judgments of any listing or employer. Never render per-listing comparisons like "this job pays below market" (deliberate product decision — see strategy notes).
- Number formatting: round pay to nearest $500 (annual) / $1 (hourly); show ranges, not false precision.

---

## 3. Structured data (JSON-LD)

All JSON-LD is emitted server-side in `<script type="application/ld+json">` (Next.js: inline in the page component or via `<Script>` in the head). URLs absolute, dates ISO 8601, omit any field lacking real data — **never emit empty strings or fabricated values** (Google issues manual actions for fake `JobPosting` data).

### 3.1 `JobPosting` — on every job detail page

This is the highest-value item in the entire slice: valid `JobPosting` markup makes listings eligible for the **Google for Jobs** widget, which is a major free-traffic channel independent of organic rankings.

Field mapping from the extraction pipeline:

```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "<extracted title, cleaned — no ALL CAPS, no 'Hiring Now!!'>",
  "description": "<full HTML description>",
  "datePosted": "<ingested posted_at, ISO 8601>",
  "validThrough": "<expiry if known; else posted_at + 30 days>",
  "employmentType": "<FULL_TIME | PART_TIME | CONTRACTOR | TEMPORARY | INTERN>",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "<employer name>",
    "sameAs": "<employer website if extracted>"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "<city>",
      "addressRegion": "<state code>",
      "addressCountry": "US"
    }
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": {
      "@type": "QuantitativeValue",
      "minValue": "<extracted min>",
      "maxValue": "<extracted max>",
      "unitText": "<HOUR | YEAR>"
    }
  },
  "directApply": false
}
```

Google-specific rules Claude Code must enforce:

- **Remote jobs:** omit `jobLocation`; instead set `"jobLocationType": "TELECOMMUTE"` and `applicantLocationRequirements` (e.g., `{"@type": "Country", "name": "USA"}`). Google rejects remote postings missing `applicantLocationRequirements`.
- **`validThrough` is required in practice.** When a listing expires or is removed at source, either 404/410 the page or keep the page with `validThrough` in the past — never leave expired jobs marked active (this is the #1 cause of Google Jobs manual actions for aggregators).
- **`directApply: false`** — Topezia links out to the source in Phase 1. Do not claim direct apply.
- `baseSalary` only when pay was actually extracted; omit the whole block otherwise.
- **`title` is the job title only** — never append location or salary into it.

### 3.2 `ItemList` — on programmatic listing pages

Each role/location page emits an `ItemList` of the top listings (cap at 20), each item pointing to the job detail URL. This helps Google associate the hub page with its postings.

### 3.3 `BreadcrumbList` — on all job and programmatic pages

`Home → [Vertical] → [Role] → [Location]` mirroring the visible breadcrumb (which must also exist in the UI).

### 3.4 Site-level

- `Organization` schema on the homepage (name, logo, url, `sameAs` socials when they exist).
- `WebSite` schema with `SearchAction` (sitelinks search box) once on-site search ships.
- `dateModified` on programmatic pages = stats `computed_at`.

### 3.5 Validation (definition of done)

- Every schema type passes **Google Rich Results Test** with zero errors (warnings acceptable only for genuinely-absent optional fields).
- Add a CI step (GitHub Actions) that spot-validates 5 random generated pages' JSON-LD against the schema.org types using a JSON-LD validator lib — catches regressions when extraction output changes.

---

## 4. Sitemaps & indexing plumbing

- **Sitemap index** at `/sitemap.xml` splitting into: `sitemap-jobs-[n].xml` (detail pages, ≤ 10k URLs each, with `lastmod`), `sitemap-roles.xml`, `sitemap-locations.xml`, `sitemap-static.xml`.
- Regenerate sitemaps at the end of each ingestion run (same GitHub Actions job that triggers revalidation). Expired jobs drop out of the sitemap the same run they expire.
- `robots.txt`: allow all, reference sitemap index, disallow `/admin/`, `/api/`.
- Canonical tag on every page, self-referencing; filtered/sorted query-param variants canonicalize to the clean URL.
- Submit sitemap in Google Search Console + verify domain (manual founder step — flag in kickoff checklist).

---

## 5. Sequencing within Slice 4

1. `JobPosting` schema on job detail pages + expiry handling *(fastest traffic win — Google Jobs widget)*
2. `page_stats` computation in the ingestion run
3. Programmatic role & role×location pages with stats blocks + gate logic
4. Sitemaps + on-demand revalidation hook
5. `ItemList`/`BreadcrumbList`/site-level schema
6. Search Console submission (founder)

Items 1–2 are prerequisites for 3; don't ship programmatic pages before stats exist.
