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

const EMBEDDING_MODEL = "voyage-3-lite"; // cheapest tier; upgrade to voyage-3 if match quality needs it
const EMBEDDING_DIM = 1536; // must match prisma/migrations/000_init_vector_support
// NOTE: the "Job".embedding column is vector(1536), but no Voyage model emits
// 1536 dims natively (their Matryoshka sizes are 256/512/1024/2048). Before
// the first real embedding run, reconcile these: either switch to a model+dim
// that matches (e.g. voyage-3.5-lite @ 1024) and re-dimension the column while
// the table is still empty, or keep 1536 with a provider that supports it.
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
