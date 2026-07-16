/**
 * Backfill embeddings for LIVE jobs that don't have one yet.
 *
 * Run: npx tsx scripts/backfill-embeddings.ts [--limit=N] [--delay-ms=21000]
 *
 * Ingestion can run with embeddings skipped (no Voyage key, or to avoid
 * free-tier rate limits slowing the crawl); this pass fills them in. It's
 * resumable — only touches jobs where embedding IS NULL — so it can be run
 * repeatedly until caught up.
 *
 * Throttled for Voyage's free tier (3 RPM / 10K TPM): a delay between calls
 * keeps us under the limit and avoids burning time on 429 retries. Bump the
 * limit / drop the delay once a paid Voyage tier lifts the rate cap.
 */

import { prisma } from "@/lib/prisma";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";
import { stripHtml } from "@/lib/ingestion/normalize-rules";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const delayArg = process.argv.find((a) => a.startsWith("--delay-ms="));
  const delayMs = delayArg ? parseInt(delayArg.split("=")[1], 10) : 21_000;

  const ids = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Job" WHERE embedding IS NULL AND status = 'LIVE' ORDER BY "createdAt" ASC ${
      limit ? `LIMIT ${limit}` : ""
    }`
  );
  console.log(`${ids.length} LIVE jobs missing embeddings${limit ? ` (limited to ${limit})` : ""}.`);

  let embedded = 0,
    skipped = 0;
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) await sleep(delayMs); // pace under the free-tier rate limit

    const job = await prisma.job.findUnique({
      where: { id: ids[i].id },
      select: {
        titleRaw: true,
        titleNormalized: true,
        descriptionRaw: true,
        skills: { select: { skill: { select: { name: true } } } },
      },
    });
    if (!job) continue;

    const input = buildJobEmbeddingInput({
      titleNormalized: job.titleNormalized,
      titleRaw: job.titleRaw,
      skills: job.skills.map((s) => s.skill.name),
      descriptionText: stripHtml(job.descriptionRaw),
    });
    const emb = await embedText(input);
    if (emb) {
      await writeJobEmbedding(prisma, ids[i].id, emb);
      embedded++;
    } else {
      skipped++; // rate-limited after retries or no key — a later run picks it up
    }
    if ((i + 1) % 5 === 0) console.log(`  ...${i + 1}/${ids.length} (embedded ${embedded}, skipped ${skipped})`);
  }

  console.log(`\nDone. Embedded: ${embedded}, Skipped: ${skipped}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
