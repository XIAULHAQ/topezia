/**
 * Read side of LlmUsage — what /hq/ai-cost shows and what the Monday digest
 * quotes. Pure aggregation over the rows lib/llm.ts writes; nothing here
 * calls a model.
 *
 * Costs are the estimates stamped at write time (list price × tokens), so
 * they can differ slightly from the invoice — the console is the bill, this
 * is the breakdown.
 */
import { prisma } from "@/lib/prisma";

export type FeatureLine = {
  feature: string;
  bucket: string;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  avgLatencyMs: number;
};

export type DayLine = { day: string; bucket: string; costUsd: number; calls: number };
export type SiteLine = { siteId: string; domain: string | null; companyName: string | null; plan: string | null; calls: number; costUsd: number };

export type CostReport = {
  since: string;
  until: string;
  totalUsd: number;
  totalCalls: number;
  byBucket: Record<string, { costUsd: number; calls: number }>;
  byFeature: FeatureLine[];
  byDay: DayLine[];
  topSites: SiteLine[];
  /** Calls that failed, by HTTP status — a wall of 400s is an empty balance. */
  failures: { status: number | null; calls: number; lastAt: string }[];
};

export async function costReport(days: number, now = new Date()): Promise<CostReport> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [byFeatureRaw, byDayRaw, topSitesRaw, failuresRaw] = await Promise.all([
    prisma.$queryRaw<{ feature: string; bucket: string; calls: bigint; failed: bigint; input: bigint; output: bigint; cost: number | null; latency: number | null }[]>`
      SELECT feature, bucket,
             COUNT(*)::bigint AS calls,
             COUNT(*) FILTER (WHERE NOT ok)::bigint AS failed,
             COALESCE(SUM("inputTokens"), 0)::bigint AS input,
             COALESCE(SUM("outputTokens"), 0)::bigint AS output,
             COALESCE(SUM("costUsd"), 0) AS cost,
             AVG("latencyMs") FILTER (WHERE ok) AS latency
        FROM "LlmUsage"
       WHERE "createdAt" >= ${since}
       GROUP BY feature, bucket
       ORDER BY cost DESC NULLS LAST`,
    prisma.$queryRaw<{ day: Date; bucket: string; cost: number | null; calls: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, bucket,
             COALESCE(SUM("costUsd"), 0) AS cost,
             COUNT(*)::bigint AS calls
        FROM "LlmUsage"
       WHERE "createdAt" >= ${since}
       GROUP BY 1, 2
       ORDER BY 1`,
    prisma.$queryRaw<{ siteId: string; domain: string | null; companyName: string | null; plan: string | null; calls: bigint; cost: number | null }[]>`
      SELECT u."siteId", s.domain, c.name AS "companyName", c.plan,
             COUNT(*)::bigint AS calls,
             COALESCE(SUM(u."costUsd"), 0) AS cost
        FROM "LlmUsage" u
        LEFT JOIN "WidgetSite" s ON s.id = u."siteId"
        LEFT JOIN "Company" c ON c.id = s."companyId"
       WHERE u."createdAt" >= ${since} AND u."siteId" IS NOT NULL
       GROUP BY u."siteId", s.domain, c.name, c.plan
       ORDER BY cost DESC
       LIMIT 20`,
    prisma.$queryRaw<{ status: number | null; calls: bigint; last: Date }[]>`
      SELECT status, COUNT(*)::bigint AS calls, MAX("createdAt") AS last
        FROM "LlmUsage"
       WHERE "createdAt" >= ${since} AND NOT ok
       GROUP BY status
       ORDER BY calls DESC`,
  ]);

  const byFeature: FeatureLine[] = byFeatureRaw.map((r) => ({
    feature: r.feature,
    bucket: r.bucket,
    calls: Number(r.calls),
    failed: Number(r.failed),
    inputTokens: Number(r.input),
    outputTokens: Number(r.output),
    costUsd: Number(r.cost ?? 0),
    avgLatencyMs: Math.round(Number(r.latency ?? 0)),
  }));

  const byBucket: CostReport["byBucket"] = {};
  for (const f of byFeature) {
    const b = (byBucket[f.bucket] ??= { costUsd: 0, calls: 0 });
    b.costUsd += f.costUsd;
    b.calls += f.calls;
  }

  return {
    since: since.toISOString(),
    until: now.toISOString(),
    totalUsd: byFeature.reduce((a, f) => a + f.costUsd, 0),
    totalCalls: byFeature.reduce((a, f) => a + f.calls, 0),
    byBucket,
    byFeature,
    byDay: byDayRaw.map((r) => ({ day: r.day.toISOString().slice(0, 10), bucket: r.bucket, costUsd: Number(r.cost ?? 0), calls: Number(r.calls) })),
    topSites: topSitesRaw.map((r) => ({ siteId: r.siteId, domain: r.domain, companyName: r.companyName, plan: r.plan, calls: Number(r.calls), costUsd: Number(r.cost ?? 0) })),
    failures: failuresRaw.map((r) => ({ status: r.status, calls: Number(r.calls), lastAt: r.last.toISOString() })),
  };
}

export const usd = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);

/** One line for the Monday digest: "AI spend last 7 days: $12.40 (widget $8.10 · ingestion $3.20 · member $1.10)". */
export async function spendLine(days = 7): Promise<string> {
  try {
    const r = await costReport(days);
    if (r.totalCalls === 0) return `AI spend last ${days} days: no model calls recorded.`;
    const parts = Object.entries(r.byBucket)
      .sort((a, b) => b[1].costUsd - a[1].costUsd)
      .map(([b, v]) => `${b} ${usd(v.costUsd)}`)
      .join(" · ");
    const failed = r.failures.reduce((a, f) => a + f.calls, 0);
    return `AI spend last ${days} days: ${usd(r.totalUsd)} across ${r.totalCalls.toLocaleString()} calls (${parts})${failed ? ` — ${failed} failed` : ""}.`;
  } catch {
    return "";
  }
}
