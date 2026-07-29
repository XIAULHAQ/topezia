/**
 * POST /api/jobs/{id}/view — record that someone looked at a posting.
 *
 * This is what the employer dashboard's "views" number counts. It exists
 * because the job page is ONE 900s-cached document shared by every visitor
 * (see app/job/[id]/page.tsx), so the page render itself can't count anything
 * per-viewer — the count has to come from a client ping.
 *
 * Honesty guards baked in, because this number is shown to an employer as a
 * fact about their posting:
 * - Deduped to one row per (posting, viewer, day) by a unique index, so a
 *   refresh loop can't inflate it. The write is an upsert-on-conflict, so a
 *   repeat view is a silent no-op rather than an error.
 * - The employer's own views of their own posting are not counted — otherwise
 *   checking your listing would inflate your own stats.
 * - `viewerKey` is the profile id when we know it, else the anonymous
 *   topezia_uid cookie. Never an IP: we don't want to store one, and a shared
 *   NAT would collapse a whole office into one viewer anyway.
 *
 * Fire-and-forget by design: every failure path returns 200 with a flag rather
 * than an error, because a broken counter must never surface to the person
 * reading a job posting.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const jobId = params.id;
  if (!jobId) return NextResponse.json({ counted: false });

  const { userId } = await currentIdentity();
  // No identity at all (cookies blocked) → nothing stable to dedupe on, so
  // counting would let one person drive the number arbitrarily. Skip.
  if (!userId) return NextResponse.json({ counted: false });

  // Cheap backstop on top of the unique index: the index stops duplicate DAYS,
  // this stops someone hammering the endpoint across many job ids.
  if (!rateLimit(`job-view:${userId}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ counted: false });
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, postedByUserId: true, company: { select: { ownerUserId: true } } },
    });
    // Only LIVE postings accrue views — a draft nobody can see must never
    // gain one, and an expired posting's history shouldn't keep moving.
    if (!job || job.status !== "LIVE") return NextResponse.json({ counted: false });

    // Don't let an employer inflate their own posting's numbers.
    if (job.postedByUserId === userId || job.company?.ownerUserId === userId) {
      return NextResponse.json({ counted: false, self: true });
    }

    const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });

    // Midnight UTC — matches the DATE column, and keeps "last 7 days" buckets
    // consistent regardless of where the viewer is.
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);

    await prisma.jobView.upsert({
      where: { jobId_viewerKey_day: { jobId, viewerKey: userId, day } },
      create: { jobId, viewerKey: userId, profileId: profile?.id ?? null, day },
      update: {}, // already counted today — deliberately nothing to change
    });
    return NextResponse.json({ counted: true });
  } catch {
    return NextResponse.json({ counted: false });
  }
}
