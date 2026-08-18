/**
 * POST /api/matches/rerank — spec §5 (Stage 2, the LLM enrichment)
 *
 * Runs the LLM rerank for the profile's uncached candidates, writes the score
 * cache, and returns the fully enriched, re-sorted match list. The feed calls
 * this after painting the fast Stage-1 results, so honest scores + why-lines
 * fill in without blocking the first render.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getMatches, eligibleLiveCount } from "@/lib/matching/match";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "no-profile" }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, country: true } });
  if (!profile) return NextResponse.json({ error: "no-profile" }, { status: 401 });
  // A handful a minute is plenty — the score cache absorbs legitimate reloads;
  // anything faster is a loop paying for a fresh rerank each time. Per-instance
  // (lib/rate-limit.ts), so soft, but it turns a runaway into a trickle.
  if (!rateLimit(`rerank:${userId}`, 8, 60 * 1000)) return NextResponse.json(RATE_LIMITED, { status: 429 });

  // ?kind=PROJECT (+ period/currency) mirrors GET /api/matches — enriches the
  // /projects view. Whitelisted the same way.
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") === "PROJECT" ? ("PROJECT" as const) : undefined;
  const periodRaw = sp.get("period");
  const period = kind && (periodRaw === "HOUR" || periodRaw === "PROJECT") ? periodRaw : undefined;
  const currency = kind && sp.get("currency") === "USD" ? ("USD" as const) : undefined;

  const matches = await getMatches(profile.id, { rerankN: 12, rerank: true, kind, period, currency });
  const totalLive = await eligibleLiveCount(profile.country); // eligible set, not whole corpus
  return NextResponse.json({
    matches,
    stats: { strong: matches.filter((m) => m.score >= 70).length, totalLive },
    pending: false,
  });
}
