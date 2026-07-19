/**
 * GET /api/profile/insights — the honesty mirror + roadmap (Panels 3 & 4).
 *
 * Read-only corpus diff for the current user's profile. Returns the tier too so
 * the client knows which roadmap steps to gate (everyone is FREE today).
 *
 * Also returns `changes`: what moved since the last weekly InsightSnapshot
 * (null when there's no prior capture) — the coach page's "since last week"
 * card — plus the insight-alerts opt-in state for the toggle.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getProfileInsights } from "@/lib/matching/insights";
import { snapshotFrom, diffInsights, type InsightChange, type InsightSnapshotPayload } from "@/lib/alerts/insights";

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, tier: true, insightAlerts: true },
  });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const insights = await getProfileInsights(profile.id);

  let changes: InsightChange[] | null = null;
  let changesSince: string | null = null;
  if (insights) {
    const last = await prisma.insightSnapshot.findFirst({
      where: { profileId: profile.id },
      orderBy: { capturedAt: "desc" },
      select: { payload: true, capturedAt: true },
    });
    if (last) {
      changes = diffInsights(last.payload as unknown as InsightSnapshotPayload, snapshotFrom(insights));
      changesSince = last.capturedAt.toISOString();
    }
  }

  return NextResponse.json({ tier: profile.tier, insights, changes, changesSince, insightAlerts: profile.insightAlerts });
}
