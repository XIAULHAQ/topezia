/**
 * Founding-employer waitlist stats — GET /api/hq/waitlist-stats
 * Requires the signed /hq session cookie (password sign-in, lib/hq-auth.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";

const FOUNDING_MEMBER_CAP = 100;

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [totalSignups, foundingCount, byVertical, recent, byStatus] = await Promise.all([
    prisma.waitlistSignup.count(),
    prisma.waitlistSignup.count({ where: { isFoundingMember: true } }),
    prisma.waitlistSignup.groupBy({
      by: ["verticalSlug"],
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.waitlistSignup.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        companyName: true,
        contactName: true,
        email: true,
        careersPageUrl: true,
        verticalSlug: true,
        hiringVolume: true,
        isFoundingMember: true,
        foundingRank: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.waitlistSignup.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  // Signups over time (last 30 days, by day) — the growth-chart data point.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSignups = await prisma.waitlistSignup.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
  });
  const byDay: Record<string, number> = {};
  for (const s of recentSignups) {
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  return NextResponse.json({
    totalSignups,
    foundingMembers: {
      count: foundingCount,
      cap: FOUNDING_MEMBER_CAP,
      remaining: Math.max(0, FOUNDING_MEMBER_CAP - foundingCount),
    },
    byVertical: byVertical.map((v) => ({
      vertical: v.verticalSlug || "unspecified",
      count: v._count._all,
    })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    signupsByDay: byDay,
    recentSignups: recent,
  });
}
