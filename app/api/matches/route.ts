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
import { currentIdentity } from "@/lib/identity";
import { getMatches, type JobMatch } from "@/lib/matching/match";

export const maxDuration = 60;

async function resolveIdentity(): Promise<{ profileId: string | null; authed: boolean }> {
  const { userId, authed } = await currentIdentity();
  if (!userId) return { profileId: null, authed };
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return { profileId: profile?.id ?? null, authed };
}

function respond(matches: JobMatch[], totalLive: number, authed: boolean) {
  return NextResponse.json({
    matches,
    stats: { strong: matches.filter((m) => m.score >= 70).length, totalLive },
    pending: matches.some((m) => m.pending),
    authed,
  });
}

export async function GET() {
  const { profileId, authed } = await resolveIdentity();
  if (!profileId) return NextResponse.json({ error: "no-profile" }, { status: 401 });

  const matches = await getMatches(profileId, { rerankN: 12, rerank: false });
  const totalLive = await prisma.job.count({ where: { status: "LIVE" } });
  return respond(matches, totalLive, authed);
}
