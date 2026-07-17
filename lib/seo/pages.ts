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

export const MIN_JOBS_FOR_PAGE = 5;
const REMOTE_PREFIX = "remote-";
const REMOTE_TYPES: RemoteType[] = ["REMOTE_US", "REMOTE_GLOBAL"];

export interface SeoJob {
  id: string;
  titleRaw: string;
  companyName: string;
  locationState: string | null;
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
  kind: "vertical" | "role" | "remote-role" | "role-state";
  heading: string;
  intro: string;
  canonicalPath: string;
  jobs: SeoJob[];
  total: number;
  siblings: { href: string; label: string }[];
}

const JOB_SELECT = {
  id: true, titleRaw: true, companyName: true, locationState: true, remoteType: true,
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
};
export const stateName = (abbr: string) => STATE_NAMES[abbr.toUpperCase()] ?? abbr.toUpperCase();

/**
 * Resolve a /jobs/* slug (plus optional state) into a publishable page, or null
 * if it doesn't exist / is too thin. Caller should 404 on null.
 */
export async function resolveSeoPage(slug: string, state?: string): Promise<SeoPage | null> {
  const clean = slug.toLowerCase();

  // /jobs/{role-slug}/{state}
  if (state) {
    const st = state.toUpperCase();
    if (!STATE_NAMES[st]) return null;
    const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });
    if (!role) return null;
    const where = { status: "LIVE" as const, roleId: role.id, locationState: st };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "role-state",
      heading: `${role.name} jobs in ${stateName(st)}`,
      intro: `${total} verified ${role.name.toLowerCase()} ${total === 1 ? "opening" : "openings"} in ${stateName(st)}, aggregated from company career pages and checked for freshness. Upload your résumé once and Topezia scores each one against your actual experience — honestly, including the weak fits.`,
      canonicalPath: `/jobs/${role.slug}/${st.toLowerCase()}`,
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
    const where = { status: "LIVE" as const, roleId: role.id, remoteType: { in: REMOTE_TYPES } };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "remote-role",
      heading: `Remote ${role.name} jobs`,
      intro: `${total} remote ${role.name.toLowerCase()} ${total === 1 ? "role" : "roles"} you can do from anywhere in the US — pulled straight from company career pages, not reposted by a middleman. Topezia tells you which ones actually fit your experience, and which don't.`,
      canonicalPath: `/jobs/remote-${role.slug}`,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForRole(role.id, role.slug),
    };
  }

  // /jobs/{role-slug}
  const role = await prisma.role.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });
  if (role) {
    const where = { status: "LIVE" as const, roleId: role.id };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "role",
      heading: `${role.name} jobs`,
      intro: `${total} verified ${role.name.toLowerCase()} ${total === 1 ? "opening" : "openings"}, aggregated from company career pages across the US and re-checked so you don't click a dead listing. Upload your résumé once and see an honest match score — and the skill gaps — for every one.`,
      canonicalPath: `/jobs/${role.slug}`,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForRole(role.id, role.slug),
    };
  }

  // /jobs/{vertical-slug}
  const vertical = await prisma.vertical.findUnique({ where: { slug: clean }, select: { id: true, name: true, slug: true } });
  if (vertical && vertical.slug !== "unsorted") {
    const where = { status: "LIVE" as const, verticalId: vertical.id };
    const total = await prisma.job.count({ where });
    if (total < MIN_JOBS_FOR_PAGE) return null;
    return {
      kind: "vertical",
      heading: `${vertical.name} jobs`,
      intro: `${total} verified ${vertical.name.toLowerCase()} ${total === 1 ? "opening" : "openings"} from across the web, in one honest feed. No application trapping — Topezia sends you straight to the original posting, and tells you why each job does or doesn't fit.`,
      canonicalPath: `/jobs/${vertical.slug}`,
      jobs: await prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: 50 }),
      total,
      siblings: await siblingsForVertical(vertical.id, vertical.slug),
    };
  }

  return null;
}

/** Role ↔ state ↔ remote lattice — internal linking for free (§7). */
async function siblingsForRole(roleId: string, roleSlug: string, excludeState?: string) {
  const out: { href: string; label: string }[] = [];

  const remote = await prisma.job.count({ where: { status: "LIVE", roleId, remoteType: { in: REMOTE_TYPES } } });
  if (remote >= MIN_JOBS_FOR_PAGE && !excludeState) out.push({ href: `/jobs/remote-${roleSlug}`, label: `Remote (${remote})` });

  const states = await prisma.job.groupBy({
    by: ["locationState"],
    where: { status: "LIVE", roleId, locationState: { not: null } },
    _count: { id: true },
  });
  for (const s of states) {
    if (!s.locationState || s.locationState === excludeState) continue;
    if (s._count.id < MIN_JOBS_FOR_PAGE) continue;
    out.push({ href: `/jobs/${roleSlug}/${s.locationState.toLowerCase()}`, label: `${stateName(s.locationState)} (${s._count.id})` });
  }
  if (excludeState) out.push({ href: `/jobs/${roleSlug}`, label: "All locations" });
  return out.slice(0, 12);
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

  const [verticals, roles, vCounts, rCounts, rRemote, rStates] = await Promise.all([
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
  for (const c of rStates) {
    const slug = c.roleId ? rSlug.get(c.roleId) : null;
    if (slug && c.locationState && c._count.id >= MIN_JOBS_FOR_PAGE) {
      paths.push(`/jobs/${slug}/${c.locationState.toLowerCase()}`);
    }
  }

  return paths;
}
