/**
 * GET /api/profile/insights — the honesty mirror + roadmap (Panels 3 & 4).
 *
 * Read-only corpus diff for the current user's profile. Returns the tier too so
 * the client knows which roadmap steps to gate (everyone is FREE today).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getProfileInsights } from "@/lib/matching/insights";

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, tier: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const insights = await getProfileInsights(profile.id);
  return NextResponse.json({ tier: profile.tier, insights });
}
