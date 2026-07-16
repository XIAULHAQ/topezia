/**
 * POST /api/matches/rerank — spec §5 (Stage 2, the LLM enrichment)
 *
 * Runs the LLM rerank for the profile's uncached candidates, writes the score
 * cache, and returns the fully enriched, re-sorted match list. The feed calls
 * this after painting the fast Stage-1 results, so honest scores + why-lines
 * fill in without blocking the first render.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readAnonUid } from "@/lib/anon-session";
import { getMatches } from "@/lib/matching/match";

export const maxDuration = 60;

export async function POST() {
  const uid = readAnonUid();
  if (!uid) return NextResponse.json({ error: "no-profile" }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId: uid }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "no-profile" }, { status: 401 });

  const matches = await getMatches(profile.id, { rerankN: 12, rerank: true });
  const totalLive = await prisma.job.count({ where: { status: "LIVE" } });
  return NextResponse.json({
    matches,
    stats: { strong: matches.filter((m) => m.score >= 70).length, totalLive },
    pending: false,
  });
}
