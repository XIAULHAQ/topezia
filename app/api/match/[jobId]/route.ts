/**
 * GET /api/match/{jobId} — the current member's match for ONE job.
 *
 * Client-fetched by the job detail page's match card: the page itself is one
 * cached document for everyone (SEO), so anything per-viewer arrives this way.
 * Cache-first via scoreOneJob — a view that came from the feed costs nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { scoreOneJob } from "@/lib/matching/match";

export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ none: "no-profile" });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ none: "no-profile" });

  const match = await scoreOneJob(profile.id, params.jobId);
  if (!match) return NextResponse.json({ none: "unscorable" });
  return NextResponse.json({ match });
}
