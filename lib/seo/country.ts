/**
 * Real data for the designed country pages (/jobs/{country}) — hero stats,
 * field breakdown, market snapshot, fresh roles.
 *
 * Everything here is COUNTED, never invented (the design mock shipped with
 * fabricated city counts and PKR salaries — we render only what the corpus
 * actually supports, and omit sections whose data we don't have yet, exactly
 * like the missing country header images). "Eligible" mirrors the country SEO
 * page: located in the country + globally-remote roles hireable from anywhere.
 */
import { prisma } from "@/lib/prisma";

export interface CountryExtras {
  totalEligible: number;
  postedLast7d: number;
  remoteSharePct: number; // % of eligible roles that are globally remote
  medianAgeDays: number | null;
  fields: { name: string; slug: string; count: number; new7d: number }[];
  snapshot: { big: string; text: string }[];
  fresh: {
    id: string; titleRaw: string; companyName: string;
    salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string | null;
    remoteScope: string | null; country: string | null; employmentType: string;
    firstSeenAt: Date;
  }[];
}

const eligibleWhere = (iso: string) => ({
  status: "LIVE" as const,
  kind: "JOB" as const,
  OR: [{ country: iso }, { remoteScope: "GLOBAL" }],
});

export async function getCountryExtras(iso: string): Promise<CountryExtras> {
  const where = eligibleWhere(iso);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [total, last7d, remoteGlobal, verticals, vCounts, v7dCounts, ages, seniorSalaried, fresh] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.count({ where: { ...where, firstSeenAt: { gt: weekAgo } } }),
    prisma.job.count({ where: { ...where, remoteScope: "GLOBAL" } }),
    prisma.vertical.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.job.groupBy({ by: ["verticalId"], where, _count: { id: true } }),
    prisma.job.groupBy({ by: ["verticalId"], where: { ...where, firstSeenAt: { gt: weekAgo } }, _count: { id: true } }),
    prisma.job.findMany({ where, select: { postedAt: true, firstSeenAt: true }, take: 3000 }),
    prisma.job.findMany({
      where: { ...where, seniority: { in: ["SENIOR", "LEAD", "EXEC"] }, salaryMin: { not: null }, salaryPeriod: "YEAR", salaryCurrency: "USD" },
      select: { salaryMin: true, salaryMax: true },
      take: 2000,
    }),
    prisma.job.findMany({
      where,
      orderBy: { firstSeenAt: "desc" },
      take: 10,
      select: {
        id: true, titleRaw: true, companyName: true,
        salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
        remoteScope: true, country: true, employmentType: true, firstSeenAt: true,
      },
    }),
  ]);

  const vById = new Map(verticals.map((v) => [v.id, v]));
  const new7dByVertical = new Map(v7dCounts.map((c) => [c.verticalId, c._count.id]));
  const fields = vCounts
    .map((c) => {
      const v = vById.get(c.verticalId);
      return v && v.slug !== "unsorted"
        ? { name: v.name, slug: v.slug, count: c._count.id, new7d: new7dByVertical.get(c.verticalId) ?? 0 }
        : null;
    })
    .filter((f): f is NonNullable<typeof f> => !!f)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Median posting age in days (postedAt when the source gave one, else first
  // seen by us — an upper bound on freshness, not an invention).
  let medianAgeDays: number | null = null;
  if (ages.length > 0) {
    const days = ages
      .map((a) => (Date.now() - new Date(a.postedAt ?? a.firstSeenAt).getTime()) / 86400000)
      .sort((x, y) => x - y);
    medianAgeDays = Math.round(days[Math.floor(days.length / 2)]);
  }

  // Snapshot lines — each rendered only when the underlying data exists.
  const snapshot: { big: string; text: string }[] = [];
  if (last7d > 0) snapshot.push({ big: String(last7d), text: "new postings in the last 7 days — the market is moving" });
  if (seniorSalaried.length >= 10) {
    const mids = seniorSalaried.map((s) => ((s.salaryMin ?? 0) + (s.salaryMax ?? s.salaryMin ?? 0)) / 2).sort((a, b) => a - b);
    const med = mids[Math.floor(mids.length / 2)];
    snapshot.push({ big: `$${Math.round(med / 1000)}k`, text: `median advertised salary across ${seniorSalaried.length} senior roles that post pay` });
  }
  if (total > 0) snapshot.push({ big: `${Math.round((remoteGlobal / total) * 100)}%`, text: "of these roles are remote and hireable from anywhere" });

  return {
    totalEligible: total,
    postedLast7d: last7d,
    remoteSharePct: total > 0 ? Math.round((remoteGlobal / total) * 100) : 0,
    medianAgeDays,
    fields,
    snapshot: snapshot.slice(0, 3),
    fresh,
  };
}

/** Countries with a header image in /public/country-headers. Others render the hero without one. */
export const COUNTRY_HEADER_IMAGES: Record<string, string> = {
  PK: "/country-headers/pk.jpg",
};
