/**
 * Deduplication — spec §4.3.
 *
 * Same job appears on multiple boards/aggregators. Cascade, cheapest check
 * first:
 *   (a) exact descriptionHash match -> instant duplicate
 *   (b) same company_domain + fuzzy title (trigram > 0.85) + same location
 *   (c) embedding cosine > 0.95 within same company -> flag for review
 *
 * Source priority when picking the survivor: ATS > aggregator > CPC feed —
 * except when the CPC copy pays and the ATS copy doesn't, in which case we
 * still DISPLAY the ATS copy (honesty/UX first) but keep the CPC job linked
 * for revenue attribution rather than discarding it outright. See spec §4.3
 * exception note.
 */

import { prisma } from "@/lib/prisma";
import { JobSource, JobStatus } from "@prisma/client";

const SOURCE_PRIORITY: Record<JobSource, number> = {
  GREENHOUSE: 1,
  LEVER: 1,
  ASHBY: 1,
  WORKABLE: 1,
  SMARTRECRUITERS: 1,
  JOBPOSTING_SCHEMA: 2,
  ADZUNA: 3,
  JOOBLE: 3,
  CPC_FEED: 4,
};

interface DedupCandidate {
  id: string;
  source: JobSource;
  titleRaw: string;
  companyDomain: string | null;
  locationState: string | null;
  descriptionHash: string;
}

/** Picks the survivor between two duplicate candidates. Lower priority number wins. */
function pickSurvivor(a: DedupCandidate, b: DedupCandidate): { survivor: DedupCandidate; loser: DedupCandidate } {
  const aPriority = SOURCE_PRIORITY[a.source];
  const bPriority = SOURCE_PRIORITY[b.source];
  return aPriority <= bPriority ? { survivor: a, loser: b } : { survivor: b, loser: a };
}

/**
 * Run against a single newly-ingested job. Checks it against existing LIVE
 * jobs and marks whichever should lose as DUPLICATE, pointing duplicateOfId
 * at the survivor. Call this once per job right after normalization —
 * cheap enough per-job; a nightly full-table sweep is unnecessary at
 * Phase 1 volume (15-25k jobs, spec §9).
 */
export async function dedupeJob(newJob: DedupCandidate): Promise<{ isDuplicate: boolean; survivorId: string | null }> {
  // Rule (a): exact description hash match, cheapest and highest confidence.
  const exactMatch = await prisma.job.findFirst({
    where: {
      descriptionHash: newJob.descriptionHash,
      status: JobStatus.LIVE,
      id: { not: newJob.id },
    },
    select: { id: true, source: true, titleRaw: true, companyDomain: true, locationState: true, descriptionHash: true },
  });

  if (exactMatch) {
    const { survivor, loser } = pickSurvivor(newJob, exactMatch as DedupCandidate);
    if (loser.id === newJob.id) {
      return { isDuplicate: true, survivorId: survivor.id };
    }
    // The new job wins — demote the old one instead.
    await prisma.job.update({
      where: { id: loser.id },
      data: { status: JobStatus.DUPLICATE, duplicateOfId: survivor.id },
    });
    return { isDuplicate: false, survivorId: null };
  }

  // Rule (b): same company + fuzzy title + same location.
  if (newJob.companyDomain) {
    const candidates = await prisma.$queryRawUnsafe<DedupCandidate[]>(
      `SELECT id, source, "titleRaw", "companyDomain", "locationState", "descriptionHash"
       FROM "Job"
       WHERE "companyDomain" = $1
         AND "locationState" IS NOT DISTINCT FROM $2
         AND status = 'LIVE'
         AND id != $3
         AND similarity("titleRaw", $4) > 0.85
       LIMIT 1`,
      newJob.companyDomain,
      newJob.locationState,
      newJob.id,
      newJob.titleRaw
    );

    if (candidates[0]) {
      const { survivor, loser } = pickSurvivor(newJob, candidates[0]);
      if (loser.id === newJob.id) {
        return { isDuplicate: true, survivorId: survivor.id };
      }
      await prisma.job.update({
        where: { id: loser.id },
        data: { status: JobStatus.DUPLICATE, duplicateOfId: survivor.id },
      });
      return { isDuplicate: false, survivorId: null };
    }
  }

  // Rule (c) — embedding cosine similarity within the same company — needs
  // the embedding written first, so run this pass separately after
  // embed.ts has run (see scripts/run-ingestion.ts ordering). Left as a
  // documented follow-up rather than implemented inline here, since it
  // depends on embeddings existing for both jobs being compared.
  if (newJob.companyDomain) {
    const nearDuplicates = await prisma.$queryRawUnsafe<DedupCandidate[]>(
      `SELECT id, source, "titleRaw", "companyDomain", "locationState", "descriptionHash"
       FROM "Job"
       WHERE "companyDomain" = $1
         AND status = 'LIVE'
         AND id != $2
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> (SELECT embedding FROM "Job" WHERE id = $2)) > 0.95
       LIMIT 1`,
      newJob.companyDomain,
      newJob.id
    );

    if (nearDuplicates[0]) {
      const { survivor, loser } = pickSurvivor(newJob, nearDuplicates[0]);
      if (loser.id === newJob.id) {
        return { isDuplicate: true, survivorId: survivor.id };
      }
      await prisma.job.update({
        where: { id: loser.id },
        data: { status: JobStatus.DUPLICATE, duplicateOfId: survivor.id },
      });
      return { isDuplicate: false, survivorId: null };
    }
  }

  return { isDuplicate: false, survivorId: null };
}
