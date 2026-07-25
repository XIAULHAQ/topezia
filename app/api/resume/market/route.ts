/**
 * GET /api/resume/market — the free market-stats lens for the Resume Builder.
 *
 * Pure DB counting, zero model calls: reuses getProfileInsights (the Career
 * Coach's engine) and returns the field's most-named skills with real posting
 * percentages. The CLIENT diffs them against the resume's live skill list —
 * the resume changes on every keystroke, so "is it on the resume" can't be
 * answered here.
 *
 * Fetched lazily by the page (not folded into GET /api/resume) because the
 * insight queries are an order of magnitude heavier than loading the doc, and
 * the editor must never wait on a stats card.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getProfileInsights } from "@/lib/matching/insights";

export const maxDuration = 30;

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  try {
    const insights = await getProfileInsights(profile.id);
    if (!insights) return NextResponse.json({ error: "No profile." }, { status: 404 });
    return NextResponse.json({
      fieldLabel: insights.fieldLabel,
      targetJobs: insights.targetJobs,
      reliable: insights.reliable || insights.targetJobs >= 10,
      topDemand: insights.topDemand,
    });
  } catch (err) {
    console.error("resume market stats failed:", err);
    return NextResponse.json({ error: "Couldn't load market stats." }, { status: 502 });
  }
}
