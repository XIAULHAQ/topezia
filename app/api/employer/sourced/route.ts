/**
 * GET /api/employer/sourced?jobId= — candidates who fit a posting but haven't
 * applied to it.
 *
 * Ownership is enforced here, not in the lib: only the employer who owns the
 * posting may run a sourcing query against it, so this can't be used as a
 * general "search everyone's profiles" endpoint by passing someone else's
 * jobId.
 *
 * The consent gates (openToWork AND publicVisible) live in the SQL itself —
 * see lib/employer/sourcing.ts. `poolSize` is returned so the UI can tell an
 * employer WHY the list is empty: "nobody has switched on open-to-work yet" is
 * a very different message from "your posting attracts nobody", and only one
 * of them is true.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sourceCandidates, openToWorkPoolSize } from "@/lib/employer/sourcing";

export async function GET(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required." }, { status: 400 });

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      OR: [{ postedByUserId: userId }, { company: { ownerUserId: userId } }],
    },
    select: { id: true, titleRaw: true },
  });
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The dashboard wants a taste; the invite screen wants a list to pick from.
  // Bounded either way so this can't be turned into a profile dump.
  const asked = Number(req.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), 50) : 5;

  const [candidates, poolSize] = await Promise.all([
    sourceCandidates(job.id, userId, limit),
    openToWorkPoolSize(),
  ]);

  return NextResponse.json({ jobTitle: job.titleRaw, candidates, poolSize });
}
