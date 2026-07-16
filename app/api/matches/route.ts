/**
 * GET /api/matches — spec §5, §6.2
 *
 * Resolves the session's profile and returns ranked, explained matches for the
 * feed. Reranking is an LLM call, so this can take a few seconds — the feed
 * shows a loading state while it runs.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readAnonUid } from "@/lib/anon-session";
import { getMatches } from "@/lib/matching/match";

export const maxDuration = 60;

export async function GET() {
  const uid = readAnonUid();
  if (!uid) {
    return NextResponse.json({ error: "no-profile" }, { status: 401 });
  }
  const profile = await prisma.profile.findUnique({
    where: { userId: uid },
    select: { id: true, headlineRoleId: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "no-profile" }, { status: 401 });
  }

  const matches = await getMatches(profile.id, { rerankN: 12 });
  const totalLive = await prisma.job.count({ where: { status: "LIVE" } });

  return NextResponse.json({
    matches,
    stats: {
      strong: matches.filter((m) => m.score >= 70).length,
      totalLive,
    },
  });
}
