/**
 * GET /api/career-score — the member's own AI Career Score.
 *
 * Owner-only and deliberately absent from every public surface: a score
 * visible to others would rank people, which pressures everyone to game it.
 * This is a mirror, not a leaderboard. Free by construction — see
 * lib/career/score.ts.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getCareerScore } from "@/lib/career/score";

export const maxDuration = 30; // insights counting across the field's postings

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const careerScore = await getCareerScore(profile.id);
  if (!careerScore) return NextResponse.json({ error: "No profile." }, { status: 404 });
  return NextResponse.json({ careerScore });
}
