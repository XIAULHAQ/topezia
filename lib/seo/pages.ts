/**
 * Programmatic SEO page engine — spec §7.
 *
 * The taxonomy IS the page generator: every Role and Vertical can become a page
 * at /jobs/{slug}, /jobs/remote-{role-slug}, or /jobs/{role-slug}/{state} — but
 * ONLY if at least MIN_JOBS_FOR_PAGE live jobs match it. Thin pages poison SEO,
 * so a page that drops below the floor simply 404s (auto-unpublish); one that
 * rises above it appears (auto-publish). No nightly job needed — the rule is
 * evaluated per request and reflected in the sitemap.
 */
import { prisma } from "@/lib/prisma";
import type { EmploymentType, RemoteType, SalaryPeriod } from "@prisma/client";
import { getCachedIntro } from "./intro";

export const MIN_JOBS_FOR_PAGE = 5;
const REMOTE_PREFIX = "remote-";
const REMOTE_TYPES: RemoteType[] = ["REMOTE_US", "REMOTE_GLOBAL"];

export interface SeoJob {
  id: string;
  titleRaw: string;
  companyName: string;
  locationState: string | null;
  country: string | null;
  remoteScope: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  lastVerifiedAt: Date;
  postedAt: Date | null;
  source: string;
  sourceUrl: string;
  descriptionRaw: string;
}

export interface SeoPage {
  kind: "vertical" | "role" | "remote-role" | "role-state" | "role-country" | "place";
  heading: string;
  intro: string;
  canonicalPath: string;
  slug: string; // as it appears in /jobs/{slug} — what the alert form posts
  state?: string; // lowercase state segment, for role-state pages
  country?: string; // ISO-2, for role-country pages
  jobs: SeoJob[];
  total: number;
  siblings: { href: string; label: string }[];
}

const JOB_SELECT = {
  id: true, titleRaw: true, companyName: true, locationState: true, country: true, remoteScope: true, remoteType: true,
  employmentType: true, salaryMin: true, salaryMax: true, salaryPeriod: true,
  lastVerifiedAt: true, postedAt: true, source: true, sourceUrl: true, descriptionRaw: true,
} as const;

const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",
  DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
  KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",
  MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",
  OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",
  TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
  WI:"Wisconsin",WY:"Wyoming",
  DC:"Washington, D.C.", // not a state; ingestion emits it and DC is a real job market
};
export const stateName = (abbr: string) => STATE_NAMES[abbr.toUpperCase()] ?? abbr.toUpperCase();

const stateSlug = (abbr: string) => (STATE_NAMES[abbr] ?? abbr).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const STATE_BY_SLUG: Record<string, string> = Object.fromEntries(Object.keys(STATE_NAMES).map((a) => [stateSlug(a), a]));
export const stateSlugFor = (abbr: string) => stateSlug(abbr);

/**
 * Countries get FULL-NAME slugs (/jobs/backend-engineer/germany), not ISO codes.
 *
 * Codes cannot share the {place} namespace with US states: CA is California and
 * Canada, IN is Indiana and India, DE is Delaware and Germany, GA is Georgia
 * twice over. US pages keep their two-letter codes untouched; full names also
 * happen to be what people actually search.
 */
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", IE: "Ireland", DE: "Germany", FR: "France",
  ES: "Spain", PT: "Portugal", IT: "Italy", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", CH: "Switzerland", LU: "Luxembourg", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", IS: "Iceland", EE: "Estonia", LV: "Latvia",
  LT: "Lithuania", PL: "Poland", CZ: "Czechia", SK: "Slovakia", HU: "Hungary",
  RO: "Romania", BG: "Bulgaria", HR: "Croatia", SI: "Slovenia", RS: "Serbia",
  BA: "Bosnia and Herzegovina", AL: "Albania", GR: "Greece", CY: "Cyprus",
  MT: "Malta", UA: "Ukraine", MD: "Moldova", TR: "Türkiye", RU: "Russia",
  KZ: "Kazakhstan", AZ: "Azerbaijan", AM: "Armenia", UZ: "Uzbekistan", GE: "Georgia (country)",
  CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina", CL: "Chile",
  CO: "Colombia", PE: "Peru", UY: "Uruguay", EC: "Ecuador", CR: "Costa Rica",
  PA: "Panama", GT: "Guatemala", DO: "Dominican Republic",
  IL: "Israel", AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar",
  KW: "Kuwait", BH: "Bahrain", OM: "Oman", JO: "Jordan", LB: "Lebanon",
  EG: "Egypt", MA: "Morocco", TN: "Tunisia", DZ: "Algeria",
  ZA: "South Africa", NG: "Nigeria", KE: "Kenya", GH: "Ghana", ET: "Ethiopia",
  UG: "Uganda", TZ: "Tanzania", RW: "Rwanda",
  IN: "India", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
  CN: "China", HK: "Hong Kong", TW: "Taiwan", JP: "Japan", KR: "South Korea",
  SG: "Singapore", MY: "Malaysia", ID: "Indonesia", TH: "Thailand", VN: "Vietnam",
  PH: "Philippines", AU: "Australia", NZ: "New Zealand",
};

const countrySlug = (iso: string) =>
  (COUNTRY_NAMES[iso] ?? iso).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ISO_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.keys(COUNTRY_NAMES).map((iso) => [countrySlug(iso), iso])
);

export const countrySlugFor = (iso: string) => countrySlug(iso);
export const isoForCountrySlug = (slug: string): string | null => ISO_BY_SLUG[slug.toLowerCase()] ?? null;
export const countryName = (iso: string) => COUNTRY_NAMES[iso.toUpperCase()] ?? iso.toUpperCase();
export const countryHref = (roleSlug: string, iso: string) => `/jobs/${roleSlug}/${countrySlug(iso)}`;

/**
 * Resolve a /jobs/* slug (plus optional state) into a publishable page, or null
 * if it doesn't exist / is too thin. Caller should 404 on null.
 */
async function buildSeoPage(slug: string, place?: string): Promise<SeoPage | null> {
  const clean = slug.toLowerCase();

  // /jobs/{role-slug}/{place} — {place} is a US state code OR a country slug.
  // States are checked first so every existing US page resolves exactly as
  // before; a two-letter code is never read as a country.
  if (place) {
    const st = place.toUpperCase();
    const iso = ISO_BY_SLUG[place.toLowerCase()];
    if (!STATE_NAMES[st] && !iso) return null;
    const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });

    // A vertical × place page too, not just role × place. Roles are narrow: 19
    // UK jobs spread across 5 roles clears no floor, while the same jobs give
    // finance-accounting=9 and tech-software=6. Without this the country
    // lattice would publish nothing until volume is ~20x higher.
    const vertical = role
      ? null
      : await prisma.vertical.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });
    if (!role && (!vertical || vertical.slug === "unsorted")) return null;

    // /jobs/{vertical-slug}/{country}
    if (!STATE_NAMES[st] && iso && vertical) {
      const where = { status: "LIVE" as const, kind: "JOB" as const, verticalId: vertical.id, country: iso };
      const total = await prisma.job.count({ where });
      if (total < MIN_JOBS_FOR_PAGE) return null;
      const cName = countryName(iso);
      return {
        kind: "role-country",
        heading: `${vertical.name} jobs in ${cName}`,
        intro: `${total} verified ${vertical.name.toLowerCase()} ${total === 1 ? "opening" : "openings"} in ${cName}, aggregated straight from company career pages and re-checked so you don't click a dead listing. Upload your résumé once and Topezia scores each one against your actual experience — honestly, including the weak fits.`,
        canonicalPath: countryHref(vertical.slug, iso),
        slug: vertical.slug,
        country: iso,
        jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
        total,
        siblings: await siblingsForVertical(vertical.id, vertical.slug),
      };
    }
    if (!role) return null;

    // /jobs/{role-slug}/{country}
    if (!STATE_NAMES[st] && iso) {
      const where = { status: "LIVE" as const, kind: "JOB" as const, roleId: role.id, country: iso };
      const total = await prisma.job.count({ where });
      if (total < MIN_JOBS_FOR_PAGE) return null;
      const cName = countryName(iso);
      return {
        kind: "role-country",
        heading: `${role.name} jobs in ${cName}`,
        intro: `${total} verified ${role.name.toLowerCase()} ${total === 1 ? "opening" : "openings"} in ${cName}, aggregated straight from company career pages and re-checked so you don't click a dead listing. Upload your résumé once and Topezia scores each one against your actual experience — honestly, including the weak fits.`,
        canonicalPath: countryHref(role.slug, iso),
        slug: role.slug,
        country: iso,
        jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
        total,
        siblings: await siblingsForRole(role.id, role.slug, undefined, iso),
      };
    }
    const where = { status: "LIVE" as const, kind: "JOB" as const, roleId: role.id, locationState: st };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "role-state",
      heading: `${role.name} jobs in ${stateName(st)}`,
      intro: `${total} verified ${role.name.toLowerCase()} ${total === 1 ? "opening" : "openings"} in ${stateName(st)}, aggregated from company career pages and checked for freshness. Upload your résumé once and Topezia scores each one against your actual experience — honestly, including the weak fits.`,
      canonicalPath: `/jobs/${role.slug}/${st.toLowerCase()}`,
      slug: role.slug,
      state: st.toLowerCase(),
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForRole(role.id, role.slug, st),
    };
  }

  // /jobs/remote-{role-slug}
  if (clean.startsWith(REMOTE_PREFIX)) {
    const roleSlug = clean.slice(REMOTE_PREFIX.length);
    const role = await prisma.role.findUnique({ where: { slug: roleSlug }, select: { id: true, name: true, slug: true } });
    if (!role) return null;
    const where = { status: "LIVE" as const, kind: "JOB" as const, roleId: role.id, remoteType: { in: REMOTE_TYPES } };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "remote-role",
      heading: `Remote ${role.name} jobs`,
      intro: `${total} remote ${role.name.toLowerCase()} ${total === 1 ? "role" : "roles"} you can do from anywhere in the US — pulled straight from company career pages, not reposted by a middleman. Topezia tells you which ones actually fit your experience, and which don't.`,
      canonicalPath: `/jobs/remote-${role.slug}`,
      slug: `remote-${role.slug}`,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForRole(role.id, role.slug),
    };
  }

  // /jobs/{role-slug}
  const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });
  if (role) {
    const where = { status: "LIVE" as const, kind: "JOB" as const, roleId: role.id };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "role",
      heading: `${role.name} jobs`,
      intro: `${total} verified ${role.name.toLowerCase()} ${total === 1 ? "opening" : "openings"}, aggregated straight from company career pages and re-checked so you don't click a dead listing. Upload your résumé once and see an honest match score — and the skill gaps — for every one.`,
      canonicalPath: `/jobs/${role.slug}`,
      slug: role.slug,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForRole(role.id, role.slug),
    };
  }

  // /jobs/{place} — all live jobs in one state or country, across every
  // vertical. Full-name slugs only, so it can't collide with a role/vertical
  // slug or with the 2-letter state codes used deeper in the lattice.
  //
  // Country pages are ELIGIBILITY-based, mirroring the feed: jobs located in
  // the country PLUS globally-remote jobs hireable from anywhere. That's what
  // a seeker in Pakistan or the Gulf actually wants, and it's the only honest
  // way to serve markets where located supply is still thin (PK has 0 located
  // jobs but 200+ open to applicants there).
  const placeCountry = ISO_BY_SLUG[clean];
  const placeState = STATE_BY_SLUG[clean];
  if (placeCountry || placeState) {
    const where = placeCountry
      ? { status: "LIVE" as const, kind: "JOB" as const, OR: [{ country: placeCountry }, { remoteScope: "GLOBAL" }] }
      : { status: "LIVE" as const, kind: "JOB" as const, locationState: placeState! };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    const name = placeCountry ? countryName(placeCountry) : stateName(placeState!);
    return {
      kind: "place",
      heading: placeCountry ? `Jobs in ${name} & open to applicants there` : `Jobs in ${name}`,
      intro: placeCountry
        ? `${total} verified ${total === 1 ? "opening" : "openings"} open to applicants in ${name} — roles located there plus remote jobs hireable from anywhere. Aggregated straight from company career pages and re-checked so you don't click a dead listing. Upload your résumé once and Topezia scores each one against your actual experience — honestly, including the weak fits.`
        : `${total} verified ${total === 1 ? "opening" : "openings"} in ${name}, aggregated straight from company career pages and re-checked so you don't click a dead listing. Upload your résumé once and Topezia scores each one against your actual experience — honestly, including the weak fits.`,
      canonicalPath: `/jobs/${clean}`,
      slug: clean,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: [],
    };
  }

  // /jobs/{vertical-slug}
  const vertical = await prisma.vertical.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });
  if (vertical && vertical.slug !== "unsorted") {
    const where = { status: "LIVE" as const, kind: "JOB" as const, verticalId: vertical.id };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "vertical",
      heading: `${vertical.name} jobs`,
      intro: `${total} verified ${vertical.name.toLowerCase()} ${total === 1 ? "opening" : "openings"} from across the web, in one honest feed. No application trapping — Topezia sends you straight to the original posting, and tells you why each job does or doesn't fit.`,
      canonicalPath: `/jobs/${vertical.slug}`,
      slug: vertical.slug,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForVertical(vertical.id, vertical.slug),
    };
  }

  return null;
}

/**
 * Resolve a page, preferring the cached LLM-written intro (spec §7) over the
 * templated fallback. A cache miss is not an error and never blocks the render —
 * scripts/generate-page-intros.ts fills the cache out of band.
 */
export async function resolveSeoPage(slug: string, place?: string): Promise<SeoPage | null> {
  const page = await buildSeoPage(slug, place);
  if (!page) return null;
  try {
    const cached = await getCachedIntro(page.canonicalPath);
    if (cached) page.intro = cached;
  } catch {
    // Copy is a nice-to-have; never fail a page over it.
  }
  return page;
}

/** Role ↔ state ↔ remote lattice — internal linking for free (§7). */
async function siblingsForRole(roleId: string, roleSlug: string, excludeState?: string, excludeCountry?: string) {
  const out: { href: string; label: string }[] = [];
  const onPlacePage = Boolean(excludeState || excludeCountry);

  const remote = await prisma.job.count({ where: { status: "LIVE", roleId, remoteType: { in: REMOTE_TYPES } } });
  if (remote >= MIN_JOBS_FOR_PAGE && !onPlacePage) out.push({ href: `/jobs/remote-${roleSlug}`, label: `Remote (${remote})` });

  const [states, countries] = await Promise.all([
    prisma.job.groupBy({
      by: ["locationState"],
      where: { status: "LIVE", roleId, locationState: { not: null } },
      _count: { id: true },
    }),
    prisma.job.groupBy({
      by: ["country"],
      where: { status: "LIVE", roleId, country: { not: null } },
      _count: { id: true },
    }),
  ]);

  for (const s of states) {
    if (!s.locationState || s.locationState === excludeState) continue;
    if (s._count.id < MIN_JOBS_FOR_PAGE) continue;
    out.push({ href: `/jobs/${roleSlug}/${s.locationState.toLowerCase()}`, label: `${stateName(s.locationState)} (${s._count.id})` });
  }

  for (const c of countries) {
    // US is represented by its state pages above — a "United States" sibling
    // next to "California" and "Texas" is noise.
    if (!c.country || c.country === excludeCountry || c.country === "US") continue;
    if (c._count.id < MIN_JOBS_FOR_PAGE) continue;
    if (!COUNTRY_NAMES[c.country]) continue; // never link a slug we can't resolve back
    out.push({ href: countryHref(roleSlug, c.country), label: `${countryName(c.country)} (${c._count.id})` });
  }

  if (onPlacePage) out.push({ href: `/jobs/${roleSlug}`, label: "All locations" });
  return out.slice(0, 14);
}

/** Vertical page links out to its qualifying role pages (one aggregate query). */
async function siblingsForVertical(verticalId: string, _verticalSlug: string) {
  const roles = await prisma.role.findMany({ where: { verticalId }, select: { id: true, name: true, slug: true } });
  if (roles.length === 0) return [];
  const counts = await prisma.job.groupBy({
    by: ["roleId"],
    where: { status: "LIVE", roleId: { in: roles.map((r) => r.id) } },
    _count: { id: true },
  });
  const byRole = new Map(counts.map((c) => [c.roleId, c._count.id]));
  return roles
    .map((r) => ({ r, n: byRole.get(r.id) ?? 0 }))
    .filter(({ n }) => n >= MIN_JOBS_FOR_PAGE)
    .map(({ r, n }) => ({ href: `/jobs/${r.slug}`, label: `${r.name} (${n})` }))
    .slice(0, 12);
}

/**
 * Every currently-publishable page — drives sitemap.xml (§7). Recomputed on
 * request, so pages auto-publish/unpublish as job counts cross the floor.
 *
 * Uses grouped aggregates (a handful of queries) rather than a count per role:
 * the naive version fired 150+ sequential queries and made sitemap.xml time out.
 */
export async function listPublishedPages(): Promise<string[]> {
  const paths: string[] = [];

  const [verticals, roles, vCounts, rCounts, rRemote, rStates, rCountries, vCountries] = await Promise.all([
    prisma.vertical.findMany({ select: { id: true, slug: true } }),
    prisma.role.findMany({ select: { id: true, slug: true } }),
    prisma.job.groupBy({ by: ["verticalId"], where: { status: "LIVE" }, _count: { id: true } }),
    prisma.job.groupBy({ by: ["roleId"], where: { status: "LIVE", roleId: { not: null } }, _count: { id: true } }),
    prisma.job.groupBy({
      by: ["roleId"],
      where: { status: "LIVE", roleId: { not: null }, remoteType: { in: REMOTE_TYPES } },
      _count: { id: true },
    }),
    prisma.job.groupBy({
      by: ["roleId", "locationState"],
      where: { status: "LIVE", roleId: { not: null }, locationState: { not: null } },
      _count: { id: true },
    }),
    // One more grouped aggregate, not a query per country — the sitemap already
    // timed out once from per-row counting.
    prisma.job.groupBy({
      by: ["roleId", "country"],
      where: { status: "LIVE", roleId: { not: null }, country: { not: null } },
      _count: { id: true },
    }),
    prisma.job.groupBy({
      by: ["verticalId", "country"],
      where: { status: "LIVE", country: { not: null } },
      _count: { id: true },
    }),
  ]);

  const vSlug = new Map(verticals.map((v) => [v.id, v.slug]));
  const rSlug = new Map(roles.map((r) => [r.id, r.slug]));

  for (const c of vCounts) {
    const slug = vSlug.get(c.verticalId);
    if (slug && slug !== "unsorted" && c._count.id >= MIN_JOBS_FOR_PAGE) paths.push(`/jobs/${slug}`);
  }
  for (const c of rCounts) {
    const slug = c.roleId ? rSlug.get(c.roleId) : null;
    if (slug && c._count.id >= MIN_JOBS_FOR_PAGE) paths.push(`/jobs/${slug}`);
  }
  for (const c of rRemote) {
    const slug = c.roleId ? rSlug.get(c.roleId) : null;
    if (slug && c._count.id >= MIN_JOBS_FOR_PAGE) paths.push(`/jobs/remote-${slug}`);
  }
  for (const c of vCountries) {
    const slug = vSlug.get(c.verticalId);
    if (!slug || slug === "unsorted" || !c.country || c.country === "US") continue;
    if (c._count.id < MIN_JOBS_FOR_PAGE) continue;
    if (!COUNTRY_NAMES[c.country]) continue;
    paths.push(countryHref(slug, c.country));
  }
  for (const c of rCountries) {
    const slug = c.roleId ? rSlug.get(c.roleId) : null;
    // US is covered by its state pages; listing /jobs/{role}/united-states too
    // would compete with them for the same intent.
    if (!slug || !c.country || c.country === "US") continue;
    if (c._count.id < MIN_JOBS_FOR_PAGE) continue;
    if (!COUNTRY_NAMES[c.country]) continue; // never publish a slug we can't resolve back
    paths.push(countryHref(slug, c.country));
  }
  for (const c of rStates) {
    const slug = c.roleId ? rSlug.get(c.roleId) : null;
    if (slug && c.locationState && c._count.id >= MIN_JOBS_FOR_PAGE) {
      paths.push(`/jobs/${slug}/${c.locationState.toLowerCase()}`);
    }
  }

  return paths;
}

export interface HubLink { href: string; label: string; count: number }
export interface BrowseHub {
  totalLive: number;
  verticals: HubLink[];
  roles: HubLink[];
  states: HubLink[];
  countries: HubLink[];
}

/**
 * The /jobs directory — every publishable page grouped for humans, so the hub
 * that anchors the SEO lattice is browsable (and doesn't 404 when typed).
 *
 * Same floor and same grouped-aggregate discipline as listPublishedPages: a
 * handful of queries, never one-per-row. Anything below MIN_JOBS_FOR_PAGE is
 * omitted, so the hub only ever links to pages that actually resolve.
 */
const EMPTY_HUB: BrowseHub = { totalLive: 0, verticals: [], roles: [], states: [], countries: [] };

export async function getBrowseHub(): Promise<BrowseHub> {
  let verticals, roles, totalLive, vCounts, rCounts, states, countries;
  let globalRemote = 0;
  try {
    [verticals, roles, totalLive, vCounts, rCounts, states, countries, globalRemote] = await Promise.all([
      prisma.vertical.findMany({ select: { id: true, name: true, slug: true } }),
      prisma.role.findMany({ select: { id: true, name: true, slug: true } }),
      prisma.job.count({ where: { status: "LIVE", kind: "JOB" } }),
      prisma.job.groupBy({ by: ["verticalId"], where: { status: "LIVE", kind: "JOB" }, _count: { id: true } }),
      prisma.job.groupBy({ by: ["roleId"], where: { status: "LIVE", kind: "JOB", roleId: { not: null } }, _count: { id: true } }),
      prisma.job.groupBy({ by: ["locationState"], where: { status: "LIVE", kind: "JOB", locationState: { not: null } }, _count: { id: true } }),
      prisma.job.groupBy({ by: ["country"], where: { status: "LIVE", kind: "JOB", country: { not: null } }, _count: { id: true } }),
      prisma.job.count({ where: { status: "LIVE", kind: "JOB", remoteScope: "GLOBAL" } }),
    ]);
  } catch (err) {
    // A DB blip must never crash the build or 500 the hub — degrade to empty.
    console.error("getBrowseHub failed, rendering empty hub:", err);
    return EMPTY_HUB;
  }

  const vById = new Map(verticals.map((v) => [v.id, v]));
  const rById = new Map(roles.map((r) => [r.id, r]));
  const keep = (n: number) => n >= MIN_JOBS_FOR_PAGE;
  const desc = (a: HubLink, b: HubLink) => b.count - a.count;

  const vLinks: HubLink[] = [];
  for (const c of vCounts) {
    const v = vById.get(c.verticalId);
    if (v && v.slug !== "unsorted" && keep(c._count.id)) vLinks.push({ href: `/jobs/${v.slug}`, label: v.name, count: c._count.id });
  }
  vLinks.sort(desc);

  const rLinks: HubLink[] = [];
  for (const c of rCounts) {
    const r = c.roleId ? rById.get(c.roleId) : undefined;
    if (r && keep(c._count.id)) rLinks.push({ href: `/jobs/${r.slug}`, label: r.name, count: c._count.id });
  }
  rLinks.sort(desc);

  const sLinks = states
    .filter((c) => c.locationState && keep(c._count.id))
    .map((c) => ({ href: `/jobs/${stateSlug(c.locationState!)}`, label: stateName(c.locationState!), count: c._count.id }))
    .sort(desc);

  // Country links mirror the country PAGES: located jobs + globally-remote
  // jobs open to applicants there. Pakistan + the Gulf are always featured —
  // markets we deliberately serve before local supply exists (global-remote
  // jobs are fully eligible there).
  const FEATURED_COUNTRIES = ["PK", "SA", "AE", "QA", "KW", "BH", "OM"];
  const locatedByCountry = new Map(countries.filter((c) => c.country).map((c) => [c.country!, c._count.id]));
  const countryIsos = new Set([
    ...[...locatedByCountry.keys()].filter((c) => c !== "US" && COUNTRY_NAMES[c]),
    ...FEATURED_COUNTRIES,
  ]);
  const cLinks = [...countryIsos]
    .map((iso) => ({ href: `/jobs/${countrySlug(iso)}`, label: countryName(iso), count: (locatedByCountry.get(iso) ?? 0) + globalRemote }))
    .filter((l) => keep(l.count))
    .sort(desc);

  return { totalLive, verticals: vLinks, roles: rLinks, states: sLinks, countries: cLinks };
}
