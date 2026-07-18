/**
 * /api/saves — the seeker's saved (bookmarked) jobs.
 *
 * GET    → the saved jobs with enough detail to render cards (feed marks its
 *          bookmark state from the ids; /saved renders the list).
 * POST   { jobId } → save (idempotent).
 * DELETE ?jobId=   → unsave.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

async function currentProfileId(): Promise<string | null> {
  const { userId } = await currentIdentity();
  if (!userId) return null;
  const p = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return p?.id ?? null;
}

export async function GET() {
  const pid = await currentProfileId();
  if (!pid) return NextResponse.json({ jobs: [] });
  const saves = await prisma.jobSave.findMany({
    where: { profileId: pid },
    orderBy: { createdAt: "desc" },
    select: { jobId: true },
  });
  const ids = saves.map((s) => s.jobId);
  if (ids.length === 0) return NextResponse.json({ jobs: [] });

  const rows = await prisma.job.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, titleRaw: true, companyName: true, locationState: true, country: true, remoteScope: true,
      remoteType: true, employmentType: true, salaryMin: true, salaryMax: true, salaryPeriod: true,
      source: true, lastVerifiedAt: true, status: true, vertical: { select: { slug: true } },
    },
  });
  // Preserve save order (most-recent first) and only surface still-live jobs.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const jobs = ids
    .map((id) => byId.get(id))
    .filter((j): j is NonNullable<typeof j> => !!j && j.status === "LIVE")
    .map((j) => ({
      jobId: j.id, title: j.titleRaw, company: j.companyName, locationState: j.locationState,
      country: j.country, remoteScope: j.remoteScope, remoteType: j.remoteType, employmentType: j.employmentType,
      salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryPeriod: j.salaryPeriod,
      source: j.source, verticalSlug: j.vertical?.slug ?? "", lastVerifiedAt: j.lastVerifiedAt,
    }));
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const pid = await currentProfileId();
  if (!pid) return NextResponse.json({ error: "no-profile" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!body.jobId || typeof body.jobId !== "string") return NextResponse.json({ error: "bad-request" }, { status: 400 });
  await prisma.jobSave.upsert({
    where: { profileId_jobId: { profileId: pid, jobId: body.jobId } },
    create: { profileId: pid, jobId: body.jobId },
    update: {},
  });
  return NextResponse.json({ saved: true });
}

export async function DELETE(req: NextRequest) {
  const pid = await currentProfileId();
  if (!pid) return NextResponse.json({ error: "no-profile" }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  await prisma.jobSave.deleteMany({ where: { profileId: pid, jobId } });
  return NextResponse.json({ saved: false });
}
