/**
 * GET /api/relocation/{jobId} — the Relocation fit card for the current
 * member, for ONE job. Client-fetched by RelocationCard on the job detail
 * page, same reason as /api/match/[jobId]: the page itself is one cached
 * document for everyone, so per-viewer material arrives this way.
 *
 * Unlike the match card, this is purely additive — a signed-out visitor or a
 * profile-less identity gets { show: false }, never a sign-in prompt. Missing
 * relocation info is not worth interrupting someone reading a job posting.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { buildRelocationCard } from "@/lib/relocation/build";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ show: false });
  if (!rateLimit(`relocation:${userId}`, 180, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { country: true, authorizedCountries: true, relocateCountries: true },
  });
  if (!profile) return NextResponse.json({ show: false });

  const job = await prisma.job.findUnique({
    where: { id: params.jobId },
    select: {
      country: true, remoteScope: true, descriptionRaw: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
    },
  });
  if (!job) return NextResponse.json({ show: false });

  const card = await buildRelocationCard(job, profile);
  if (!card) return NextResponse.json({ show: false });
  return NextResponse.json({ show: true, card });
}
