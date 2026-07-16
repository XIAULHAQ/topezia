/**
 * GET /api/matches — spec §5, §6.2 (Stage 1, fast)
 *
 * Returns retrieval + hard-filtered matches with any already-cached LLM scores;
 * uncached jobs come back with a provisional (similarity) score and pending=true.
 * No LLM call here, so it returns in ~2s. The feed then calls POST
 * /api/matches/rerank to enrich the pending ones (progressive loading).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readAnonUid } from "@/lib/anon-session";
import { getMatches, type JobMatch } from "@/lib/matching/match";

export const maxDuration = 60;

async function resolveProfileId(): Promise<string | null> {
  const uid = readAnonUid();
  if (!uid) return null;
  const profile = await prisma.profile.findUnique({ where: { userId: uid }, select: { id: true } });
  return profile?.id ?? null;
}

function respond(matches: JobMatch[], totalLive: number) {
  return NextResponse.json({
    matches,
    stats: { strong: matches.filter((m) => m.score >= 70).length, totalLive },
    pending: matches.some((m) => m.pending),
  });
}

export async function GET() {
  const profileId = await resolveProfileId();
  if (!profileId) return NextResponse.json({ error: "no-profile" }, { status: 401 });

  const matches = await getMatches(profileId, { rerankN: 12, rerank: false });
  const totalLive = await prisma.job.count({ where: { status: "LIVE" } });
  return respond(matches, totalLive);
}
