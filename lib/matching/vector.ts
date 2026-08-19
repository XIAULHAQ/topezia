/**
 * Profile → Job vector retrieval helpers. One place for the two things the
 * planner needs before it will touch job_embedding_hnsw_idx (migration 083):
 *
 *  1. The ORDER BY must compare against a LITERAL/PARAMETER, not a joined
 *     row. The old `... CROSS JOIN "Profile" p ... ORDER BY j.embedding <=>
 *     p.embedding` could never use an index (pg_stat: idx_scan = 0, mean
 *     3.1 s, max 25 s across a month). So: fetch the profile vector first,
 *     bind it as a param.
 *  2. The expression must match the index's: `embedding::halfvec(1024)`.
 *
 * Filtered KNN (status/kind/eligibility in the WHERE) uses pgvector >= 0.8
 * iterative scans so the index keeps yielding candidates until LIMIT is
 * satisfied, instead of returning whatever survived the first ef_search.
 * That needs SET LOCAL, i.e. a transaction — see withVectorSearch().
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const EMBED_DIM = 1024;

/** The profile's embedding as pgvector text ('[0.1,0.2,...]'), or null when
 * the profile has none yet (fresh signup before the backfill ran). */
export async function profileEmbeddingText(profileId: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ v: string | null }[]>(
    `SELECT embedding::text AS v FROM "Profile" WHERE id = $1`,
    profileId
  );
  return rows[0]?.v ?? null;
}

/** ORDER BY / SELECT fragment: cosine DISTANCE from job alias `j` to the
 * bound vector at `$n`. Matches job_embedding_hnsw_idx exactly. */
export const jobDistanceSql = (n: number, alias = "j") => `${alias}.embedding::halfvec(${EMBED_DIM}) <=> $${n}::halfvec(${EMBED_DIM})`;

/** Exact similarity for the returned rows (full-precision, not halfvec). */
export const jobSimilaritySql = (n: number, alias = "j") => `1 - (${alias}.embedding <=> $${n}::vector(${EMBED_DIM}))`;

/**
 * Run vector queries with HNSW tuned for filtered top-k.
 *
 * - ef_search >= the largest LIMIT (default 40 would cap LIMIT 100 at 40).
 * - iterative_scan = relaxed_order keeps walking the graph until LIMIT is
 *   met under restrictive filters (a Pakistan-eligible set is ~45 of 25k
 *   jobs), at the cost of near-perfect rather than perfect order — every
 *   caller reranks afterwards, so order inside the candidate set is moot.
 * - The iterative scan stops when its visited-set memory (work_mem x
 *   scan_mem_multiplier) runs out. Supabase micro's work_mem is 2 MB; at the
 *   default multiplier the scan gave up early and returned 8/21 for
 *   Bangladesh, 28/45 for Pakistan — the exact low-inventory starvation
 *   match.ts exists to prevent. 4 MB x 8 = 32 MB scan budget measured
 *   exhaustive on every selective case (BD 21/21, PK 45/45, AE 100/100) in
 *   ~150-200 ms; unselective profiles ~15 ms. Re-measure if the table grows
 *   10x. (max_scan_tuples raised too so the tuple cap isn't the next wall.)
 */
export async function withVectorSearch<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = 200`);
      await tx.$executeRawUnsafe(`SET LOCAL hnsw.iterative_scan = relaxed_order`);
      await tx.$executeRawUnsafe(`SET LOCAL hnsw.max_scan_tuples = 60000`);
      await tx.$executeRawUnsafe(`SET LOCAL hnsw.scan_mem_multiplier = 8`);
      await tx.$executeRawUnsafe(`SET LOCAL work_mem = '4MB'`);
      return fn(tx);
    },
    // Prisma's interactive-transaction default is 5 s. Warm, these run in tens
    // of ms; a cold index read on the micro instance can take seconds, and the
    // old brute-force query ran up to 25 s without ever timing out — a cold
    // miss must degrade to "slow", not to a thrown P2028.
    { maxWait: 10_000, timeout: 30_000 }
  );
}
