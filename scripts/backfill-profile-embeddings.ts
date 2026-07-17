/**
 * Backfill embeddings for profiles that don't have one yet.
 *
 * Profiles created before VOYAGE_API_KEY was set on Vercel shipped without an
 * embedding, so the matcher couldn't do similarity retrieval for them and fell
 * back to recency — showing, e.g., Indian security roles to a US backend
 * engineer. This gives each one its vector, so matching works.
 *
 * Reconstructs the same embedding input createOrUpdateProfile uses (headline +
 * skills + condensed history), then bumps matchVersion so the stale
 * recency-based MatchScore cache is dropped and the next feed load re-scores
 * against the now-correct candidates.
 *
 * Resumable (only touches embedding IS NULL). Dry-run by default; pass --apply.
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { embedText, writeProfileEmbedding } from "@/lib/ingestion/embed";
import { buildProfileEmbeddingInput } from "@/lib/matching/profile";
import type { ParsedResume } from "@/lib/matching/parse-resume";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes("--apply");
  const delayArg = process.argv.find((a) => a.startsWith("--delay-ms="));
  const delayMs = delayArg ? parseInt(delayArg.split("=")[1], 10) : 200;

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Profile" WHERE embedding IS NULL`
  );
  if (rows.length === 0) {
    console.log("Every profile already has an embedding. Nothing to do.");
    return;
  }
  console.log(`${rows.length} profile(s) without an embedding.${apply ? "" : "  (dry run — pass --apply)"}\n`);

  let embedded = 0, skipped = 0;
  for (const { id } of rows) {
    const p = await prisma.profile.findUnique({
      where: { id },
      select: { headlineRoleId: true, workHistory: true, fullName: true, skills: { select: { skill: { select: { name: true } } } } },
    });
    if (!p) continue;

    const headlineRole = p.headlineRoleId
      ? (await prisma.role.findUnique({ where: { id: p.headlineRoleId }, select: { name: true } }))?.name ?? null
      : null;
    const skills = p.skills.map((s) => ({ name: s.skill.name, confidence: 1, proficiency: null }));
    const workHistory = (p.workHistory as { title: string; company: string }[] | null) ?? [];

    const input = buildProfileEmbeddingInput({ headlineRole, skills, workHistory } as ParsedResume);
    if (!input.trim()) {
      // Nothing to embed from (no headline, skills or history) — skip rather
      // than write a meaningless vector.
      console.log(`  skip ${id.slice(0, 8)} (${p.fullName ?? "?"}) — no embeddable content`);
      skipped++;
      continue;
    }

    console.log(`  ${apply ? "embed" : "would embed"} ${id.slice(0, 8)} (${p.fullName ?? "?"}) — ${skills.length} skills`);
    if (apply) {
      const vec = await embedText(input);
      if (!vec) { console.log(`    ! embedText returned null (Voyage not configured?) — stopping`); break; }
      await prisma.profile.update({ where: { id }, data: { matchVersion: randomUUID() } });
      await writeProfileEmbedding(prisma, id, vec);
      embedded++;
      await sleep(delayMs);
    }
  }

  console.log(`\n${apply ? `Embedded ${embedded}, skipped ${skipped}.` : `Dry run — ${rows.length} would be processed.`}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
