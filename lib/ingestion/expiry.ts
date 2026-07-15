/**
 * Freshness / expiry checking — spec §4.4.
 *
 * "Dead links and duplicates are the #1 complaint about every aggregator.
 * If you're fanatical about expiry checking, that alone generates word of
 * mouth." — this file is that fanaticism, encoded.
 *
 * Cadence (run via scheduled job, e.g. Vercel Cron or a Railway cron task):
 *   - ATS jobs: re-crawled by run-ingestion.ts itself; a job missing from
 *     a fresh board response is marked EXPIRED there, not here.
 *   - Crawled/schema jobs: this file HEAD/GETs source_url on a 24h cadence.
 *   - Aggregator/CPC jobs: trust feed TTL, but re-verify anything the feed
 *     hasn't refreshed in 48h before it's allowed to keep displaying.
 *
 * Never display anything with lastVerifiedAt older than 48h (spec §4.4) —
 * that check belongs in the feed query, not here; this file's job is only
 * to keep lastVerifiedAt honest.
 */

import { prisma } from "@/lib/prisma";
import { JobSource, JobStatus } from "@prisma/client";

const STALE_THRESHOLD_HOURS = 24;
const DEAD_LINK_STATUS_CODES = [404, 410];

async function checkUrlAlive(url: string): Promise<"live" | "dead" | "unknown"> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (DEAD_LINK_STATUS_CODES.includes(res.status)) return "dead";
    if (res.ok) return "live";
    // Some ATSs 405 on HEAD — retry with GET before concluding anything.
    if (res.status === 405) {
      const getRes = await fetch(url, { method: "GET", redirect: "follow" });
      if (DEAD_LINK_STATUS_CODES.includes(getRes.status)) return "dead";
      return getRes.ok ? "live" : "unknown";
    }
    return "unknown";
  } catch {
    return "unknown"; // network error — don't kill a job over a transient blip
  }
}

/**
 * Run for crawled/JobPosting-schema and aggregator/CPC sources. ATS sources
 * (Greenhouse/Lever/Ashby) are cheaper to verify by re-crawling the board
 * directly (run-ingestion.ts handles that) rather than pinging every URL.
 */
export async function runExpiryCheck() {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  const candidates = await prisma.job.findMany({
    where: {
      status: JobStatus.LIVE,
      lastVerifiedAt: { lt: staleThreshold },
      source: { in: [JobSource.JOBPOSTING_SCHEMA, JobSource.ADZUNA, JobSource.JOOBLE, JobSource.CPC_FEED] },
    },
    select: { id: true, sourceUrl: true },
    take: 500, // batch — run this on a schedule, don't try the whole table at once
  });

  let confirmedDead = 0;
  let refreshed = 0;

  for (const job of candidates) {
    const result = await checkUrlAlive(job.sourceUrl);

    if (result === "dead") {
      // Two-step confirmation before EXPIRED (per spec §4.4: "404/410 ->
      // suspected_dead -> confirm -> expired") — a single failed check
      // could be a transient site issue, not a genuinely closed posting.
      const current = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true } });
      if (current?.status === JobStatus.SUSPECTED_DEAD) {
        await prisma.job.update({ where: { id: job.id }, data: { status: JobStatus.EXPIRED } });
        confirmedDead++;
      } else {
        await prisma.job.update({ where: { id: job.id }, data: { status: JobStatus.SUSPECTED_DEAD } });
      }
    } else if (result === "live") {
      await prisma.job.update({ where: { id: job.id }, data: { lastVerifiedAt: new Date() } });
      refreshed++;
    }
    // "unknown" — leave status untouched, will retry next run
  }

  return { checked: candidates.length, confirmedDead, refreshed };
}
