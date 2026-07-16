/**
 * Embeddings — spec §3.1, §5.
 *
 * Anthropic doesn't serve embeddings directly; Voyage AI is Anthropic's
 * recommended embedding partner and is what this file targets. Cheap
 * relative to generation — spend liberally here per spec §4.2's cost
 * guidance ("embeddings are nearly free... spend there liberally").
 *
 * If you'd rather use a different provider, this is the only file that
 * needs to change — every caller just wants a number[] back.
 */

const EMBEDDING_MODEL = "voyage-3.5-lite"; // current-gen lite tier; cheap, solid quality
const EMBEDDING_DIM = 1024; // must match the "Job"/"Profile".embedding column
// The embedding columns are vector(1024) (see prisma/migrations/002_embedding_dim).
// voyage-3.5-lite outputs 1024 dims by default. The original 000 migration used
// vector(1536), but NO Voyage model emits 1536 (verified live: voyage-3-lite is
// 512-only; voyage-3.5-lite is 1024) — 002 re-dimensioned the (then empty)
// columns to 1024 to match. If you switch models, keep model dim, EMBEDDING_DIM,
// and the column type in lockstep, and re-embed existing rows.
// Until VOYAGE_API_KEY is set, embedText() no-ops (returns null) so the rest
// of ingestion still runs — embeddings can be backfilled later.

export async function embedText(text: string): Promise<number[] | null> {
  if (!process.env.VOYAGE_API_KEY) {
    // No embedding provider configured yet. Skip rather than throw: a missing
    // enrichment key shouldn't drop every job from the index. Vector-based
    // matching (spec §5) and dedup rule (c) simply stay dormant until a key
    // exists, then a backfill pass can embed the LIVE jobs that have none.
    return null;
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: text.slice(0, 8000),
      model: EMBEDDING_MODEL,
      output_dimension: EMBEDDING_DIM,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.data[0].embedding as number[];
}

/** Builds the text a job's embedding is derived from — spec §3.1. */
export function buildJobEmbeddingInput(input: {
  titleNormalized: string | null;
  titleRaw: string;
  skills: string[];
  descriptionText: string;
}): string {
  return [
    input.titleNormalized || input.titleRaw,
    input.skills.join(", "),
    input.descriptionText.slice(0, 1000),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Prisma can't write a `vector` column through the normal client (it's an
 * Unsupported type per the schema comment), so embeddings are written via
 * raw SQL. Call this after creating/updating the Job row.
 */
export async function writeJobEmbedding(prisma: import("@prisma/client").PrismaClient, jobId: string, embedding: number[]) {
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Job" SET embedding = $1::vector WHERE id = $2`,
    vectorLiteral,
    jobId
  );
}
