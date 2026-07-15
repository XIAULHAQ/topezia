/**
 * Topezia click-out redirect — spec §6.3
 *
 * This route is the revenue and the ranking signal in one place:
 *   - logs every click (who, which job, what score/position it had)
 *   - flags CPC-attributable clicks for feed monetization (§8)
 *   - 302s straight to the source — we never trap the applicant
 *
 * GET /go/{jobId}?score=92&pos=1
 *
 * Build early, test hard — per the spec's own instruction.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;
  const scoreParam = req.nextUrl.searchParams.get("score");
  const posParam = req.nextUrl.searchParams.get("pos");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, sourceUrl: true, status: true, cpcFeedId: true },
  });

  if (!job) {
    return NextResponse.redirect(new URL("/jobs?error=not-found", req.url));
  }

  // Never send a click to a job we already know is dead — fail soft to our
  // own "sorry, this one expired" page instead of a broken external link.
  if (job.status === "EXPIRED" || job.status === "SUSPECTED_DEAD") {
    return NextResponse.redirect(
      new URL(`/jobs/expired?jobId=${jobId}`, req.url)
    );
  }

  // Resolve the logged-in profile, if any. Anonymous clicks (pre-signup
  // browsing, SEO landing pages) still redirect — they just don't log to a
  // profile. Don't block the redirect on auth.
  let profileId: string | null = null;
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      profileId = profile?.id ?? null;
    }
  } catch {
    // Auth resolution failing should never block the redirect.
  }

  if (profileId) {
    await prisma.jobClick.create({
      data: {
        profileId,
        jobId: job.id,
        matchScore: scoreParam ? parseInt(scoreParam, 10) : null,
        feedPosition: posParam ? parseInt(posParam, 10) : null,
        cpcAttributed: Boolean(job.cpcFeedId),
      },
    });
  }

  return NextResponse.redirect(job.sourceUrl, { status: 302 });
}
