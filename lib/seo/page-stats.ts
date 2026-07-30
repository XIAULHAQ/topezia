/**
 * Per-page aggregate stats — SEO addendum §2, market-signals spec §2.
 *
 * Runs at the END OF THE INGESTION RUN, never at request time. The addendum is
 * explicit about that and the reason is load: this touches every live row, and
 * a page that aggregated 13.5k jobs per request would be slower than the query
 * it replaced. Everything here is read-only aggregate SELECTs plus upserts into
 * PageStats, so it holds no lock that blocks live readers.
 *
 * Design notes worth knowing before editing:
 *
 * - **Scope key is the canonical path.** Same convention as SeoPageIntro, and it
 *   sidesteps Postgres treating NULLs as distinct in a unique index — a
 *   composite key over nullable role/vertical/state/country columns would
 *   silently permit duplicates.
 * - **Pay is the midpoint of each posting's stated range**, over postings that
 *   state one. Postings with no pay are excluded from the pay stats but still
 *   counted in listingCount — otherwise a scope where 16% state pay would report
 *   its listing count as 16% of reality.
 * - **Pay is computed for the DOMINANT pay type only.** Mixing an hourly rate
 *   and an annual salary into one median produces a number that describes
 *   nothing. `payType` records which one the figures describe.
 * - **postedAt, never firstSeenAt**, for the freshness count: firstSeenAt
 *   records when Topezia crawled a posting, so a newly-added board would read as
 *   a surge of fresh postings. See the market-signals spec §0.
 */
import { prisma } from "@/lib/prisma";
import { countrySlugFor } from "@/lib/countries";

/** Below this, the pay block is omitted entirely rather than shown as "N/A". */
export const MIN_PAY_SAMPLE = 10;

/**
 * A skill must appear in at least this share of a scope's listings to count as a
 * "top skill". Frequency rank alone is not enough.
 *
 * Found by inspecting the first real run: /jobs/account-executive came back with
 * top skills "SQL" (8 of 565 listings) and "AWS" (3 of 565). Neither is an
 * account-executive skill — they are simply the only REVIEWED skills that appear
 * at all, because the seeded skill list is tech-heavy. Rank made 1.4% look like a
 * headline. This floor drops that and keeps genuinely dominant skills
 * (backend-engineer Python is 162 of 393, 41%).
 *
 * A scope with no skill above the floor renders no skill block, which is the
 * honest answer: we don't have reviewed skills for that field yet.
 */
export const MIN_SKILL_SHARE = 0.1;

const REMOTE_TYPES = ["REMOTE_US", "REMOTE_GLOBAL", "REMOTE_INTL"];

type ScopeType = "role" | "vertical" | "remote-role" | "role-state" | "role-country";

/**
 * How each scope family maps a Job row to a canonical page path.
 *
 * `join` and `where` are trusted SQL fragments authored here — never anything
 * derived from a request. The country slug is resolved in JS afterwards rather
 * than in SQL, because the slug map lives in lib/countries — imported directly
 * so this module never pulls in lib/seo/pages, which needs a React runtime and
 * therefore cannot load inside a plain ingestion script.
 */
interface ScopeDef {
  scopeType: ScopeType;
  /** SQL expression producing the grouping key. */
  keyExpr: string;
  join: string;
  where: string;
  /** Turns the grouping key into the canonical path. Null drops the row. */
  toPageKey: (key: string) => string | null;
}

const BASE = `j.status = 'LIVE' AND j.kind = 'JOB'`;

export function scopeDefs(): ScopeDef[] {
  return [
    {
      scopeType: "role",
      keyExpr: `r.slug`,
      join: `JOIN "Role" r ON r.id = j."roleId"`,
      where: `${BASE}`,
      toPageKey: (k) => `/jobs/${k}`,
    },
    {
      scopeType: "vertical",
      keyExpr: `v.slug`,
      join: `JOIN "Vertical" v ON v.id = j."verticalId"`,
      where: `${BASE} AND v.slug <> 'unsorted'`,
      toPageKey: (k) => `/jobs/${k}`,
    },
    {
      scopeType: "remote-role",
      keyExpr: `r.slug`,
      join: `JOIN "Role" r ON r.id = j."roleId"`,
      where: `${BASE} AND j."remoteType" IN ('REMOTE_US','REMOTE_GLOBAL','REMOTE_INTL')`,
      toPageKey: (k) => `/jobs/remote-${k}`,
    },
    {
      scopeType: "role-state",
      keyExpr: `r.slug || '|' || j."locationState"`,
      join: `JOIN "Role" r ON r.id = j."roleId"`,
      where: `${BASE} AND j."locationState" IS NOT NULL`,
      toPageKey: (k) => {
        const [role, st] = k.split("|");
        return role && st ? `/jobs/${role}/${st.toLowerCase()}` : null;
      },
    },
    {
      scopeType: "role-country",
      keyExpr: `r.slug || '|' || j.country`,
      // US is represented by its state pages; a /jobs/{role}/united-states page
      // would compete with them for the same intent.
      join: `JOIN "Role" r ON r.id = j."roleId"`,
      where: `${BASE} AND j.country IS NOT NULL AND j.country <> 'US'`,
      toPageKey: (k) => {
        const [role, iso] = k.split("|");
        if (!role || !iso) return null;
        const slug = countrySlugFor(iso);
        return slug ? `/jobs/${role}/${slug}` : null;
      },
    },
  ];
}

export interface StatsRow {
  pageKey: string;
  scopeType: ScopeType;
  listingCount: number;
  companyCount: number;
  payType: string | null;
  medianPay: number | null;
  p25Pay: number | null;
  p75Pay: number | null;
  paySampleSize: number;
  topSkills: { name: string; n: number }[];
  empTypeBreakdown: Record<string, number>;
  remoteShare: number;
  postedLast7d: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Round pay the way the addendum specifies: $500 for annual, $1 for hourly. */
export function roundPay(value: number, payType: string | null): number {
  return payType === "HOUR" ? Math.round(value) : Math.round(value / 500) * 500;
}

/**
 * One scope family, in four grouped queries rather than one query per page —
 * the naive per-page version fired hundreds of round trips and is what made
 * sitemap.xml time out once already.
 */
async function computeScope(def: ScopeDef): Promise<StatsRow[]> {
  const remoteList = REMOTE_TYPES.map((t) => `'${t}'`).join(",");

  const core = await prisma.$queryRawUnsafe<
    { k: string; n: bigint; companies: bigint; remote_n: bigint; posted7: bigint }[]
  >(`
    SELECT ${def.keyExpr} AS k,
           count(*) AS n,
           count(DISTINCT j."companyName") AS companies,
           count(*) FILTER (WHERE j."remoteType" IN (${remoteList})) AS remote_n,
           count(*) FILTER (WHERE j."postedAt" > now() - interval '7 days') AS posted7
      FROM "Job" j ${def.join}
     WHERE ${def.where}
     GROUP BY 1`);

  // Pay, per (scope, payType). The dominant type is chosen in JS below.
  const pay = await prisma.$queryRawUnsafe<
    { k: string; period: string; n: bigint; p50: number; p25: number; p75: number }[]
  >(`
    SELECT ${def.keyExpr} AS k,
           j."salaryPeriod"::text AS period,
           count(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY (j."salaryMin" + j."salaryMax") / 2.0) AS p50,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY (j."salaryMin" + j."salaryMax") / 2.0) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY (j."salaryMin" + j."salaryMax") / 2.0) AS p75
      FROM "Job" j ${def.join}
     WHERE ${def.where}
       AND j."salaryMin" IS NOT NULL AND j."salaryMax" IS NOT NULL
       AND j."salaryMin" > 0 AND j."salaryPeriod" IS NOT NULL
     GROUP BY 1, 2`);

  const emp = await prisma.$queryRawUnsafe<{ k: string; t: string; n: bigint }[]>(`
    SELECT ${def.keyExpr} AS k, j."employmentType"::text AS t, count(*) AS n
      FROM "Job" j ${def.join}
     WHERE ${def.where}
     GROUP BY 1, 2`);

  // Reviewed skills only: LLM extraction coins a lot of near-duplicate phrases,
  // and an unreviewed one surfacing as a "top skill" is exactly the noise the
  // reviewed flag exists to keep out.
  const skills = await prisma.$queryRawUnsafe<{ k: string; name: string; n: bigint }[]>(`
    SELECT k, name, n FROM (
      SELECT ${def.keyExpr} AS k, s.name AS name, count(*) AS n,
             row_number() OVER (PARTITION BY ${def.keyExpr} ORDER BY count(*) DESC, s.name) AS rn
        FROM "Job" j ${def.join}
        JOIN "JobSkill" js ON js."jobId" = j.id
        JOIN "Skill" s ON s.id = js."skillId"
       WHERE ${def.where} AND s.reviewed = true
       GROUP BY 1, 2
    ) t WHERE rn <= 5`);

  const payByKey = new Map<string, typeof pay>();
  for (const p of pay) {
    const list = payByKey.get(p.k) ?? [];
    list.push(p);
    payByKey.set(p.k, list);
  }
  const empByKey = new Map<string, { t: string; n: number }[]>();
  for (const e of emp) {
    const list = empByKey.get(e.k) ?? [];
    list.push({ t: e.t, n: num(e.n) });
    empByKey.set(e.k, list);
  }
  const skillsByKey = new Map<string, { name: string; n: number }[]>();
  for (const s of skills) {
    const list = skillsByKey.get(s.k) ?? [];
    list.push({ name: s.name, n: num(s.n) });
    skillsByKey.set(s.k, list);
  }

  const out: StatsRow[] = [];
  for (const row of core) {
    const pageKey = def.toPageKey(row.k);
    if (!pageKey) continue;
    const listingCount = num(row.n);
    if (listingCount === 0) continue;

    // Dominant pay type, and only if it clears the sample floor on its own.
    const candidates = (payByKey.get(row.k) ?? []).slice().sort((a, b) => num(b.n) - num(a.n));
    const best = candidates[0];
    const paySample = best ? num(best.n) : 0;
    const hasPay = Boolean(best) && paySample >= MIN_PAY_SAMPLE;

    const empList = empByKey.get(row.k) ?? [];
    const empTotal = empList.reduce((a, b) => a + b.n, 0) || 1;
    const empTypeBreakdown: Record<string, number> = {};
    for (const e of empList) empTypeBreakdown[e.t] = Math.round((e.n / empTotal) * 100);

    out.push({
      pageKey,
      scopeType: def.scopeType,
      listingCount,
      companyCount: num(row.companies),
      payType: hasPay ? best.period : null,
      medianPay: hasPay ? roundPay(best.p50, best.period) : null,
      p25Pay: hasPay ? roundPay(best.p25, best.period) : null,
      p75Pay: hasPay ? roundPay(best.p75, best.period) : null,
      paySampleSize: paySample,
      // Rank AND share: see MIN_SKILL_SHARE for the real-data case that made
      // rank-only misleading.
      topSkills: (skillsByKey.get(row.k) ?? []).filter((s) => s.n / listingCount >= MIN_SKILL_SHARE),
      empTypeBreakdown,
      remoteShare: Math.round((num(row.remote_n) / listingCount) * 100),
      postedLast7d: num(row.posted7),
    });
  }
  return out;
}

/**
 * Recompute every scope and upsert. Rows for pages that no longer have any
 * listing are deleted, so a stale row can never outlive the page it describes —
 * the same self-pruning rule the sitemap already follows.
 */
export async function computeAllPageStats(
  log: (msg: string) => void = () => {}
): Promise<{ written: number; removed: number }> {
  const defs = scopeDefs();
  const all: StatsRow[] = [];
  for (const def of defs) {
    const rows = await computeScope(def);
    log(`  ${def.scopeType.padEnd(13)} ${rows.length} pages`);
    all.push(...rows);
  }

  const computedAt = new Date();

  // Bulk upsert, not one round-trip per page. 597 sequential upserts is ~3s
  // co-located but minutes over a normal connection, and this runs inside the
  // ingestion job — a step that slow invites exactly the "kill it and re-run"
  // that leaves the table half-written.
  //
  // Chunked because Postgres caps a statement at 65535 bind parameters; at 14
  // columns, 200 rows is ~2,800 and leaves plenty of headroom.
  const CHUNK = 200;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((r) => {
      const n = values.length;
      values.push(
        crypto.randomUUID(), r.pageKey, r.scopeType, r.listingCount, r.companyCount,
        r.payType, r.medianPay, r.p25Pay, r.p75Pay, r.paySampleSize,
        JSON.stringify(r.topSkills), JSON.stringify(r.empTypeBreakdown),
        r.remoteShare, r.postedLast7d, computedAt
      );
      return `($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6},$${n + 7},$${n + 8},$${n + 9},$${n + 10},$${n + 11}::jsonb,$${n + 12}::jsonb,$${n + 13},$${n + 14},$${n + 15})`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PageStats" ("id","pageKey","scopeType","listingCount","companyCount",
         "payType","medianPay","p25Pay","p75Pay","paySampleSize","topSkills",
         "empTypeBreakdown","remoteShare","postedLast7d","computedAt")
       VALUES ${tuples.join(",")}
       ON CONFLICT ("pageKey") DO UPDATE SET
         "scopeType" = EXCLUDED."scopeType",
         "listingCount" = EXCLUDED."listingCount",
         "companyCount" = EXCLUDED."companyCount",
         "payType" = EXCLUDED."payType",
         "medianPay" = EXCLUDED."medianPay",
         "p25Pay" = EXCLUDED."p25Pay",
         "p75Pay" = EXCLUDED."p75Pay",
         "paySampleSize" = EXCLUDED."paySampleSize",
         "topSkills" = EXCLUDED."topSkills",
         "empTypeBreakdown" = EXCLUDED."empTypeBreakdown",
         "remoteShare" = EXCLUDED."remoteShare",
         "postedLast7d" = EXCLUDED."postedLast7d",
         "computedAt" = EXCLUDED."computedAt"`,
      ...values
    );
    log(`  wrote ${Math.min(i + CHUNK, all.length)}/${all.length}`);
  }

  const { count: removed } = await prisma.pageStats.deleteMany({
    where: { computedAt: { lt: computedAt } },
  });

  return { written: all.length, removed };
}
