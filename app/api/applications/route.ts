/**
 * /api/applications — apply to a native posting; list applications.
 *
 * GET ?jobId=…  → the employer's pipeline view (must own the posting's company)
 * GET           → the member's own applications
 * POST          → apply / send a proposal (one per posting, DB-enforced)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "";

export async function GET(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (jobId) {
    // Employer view. Ownership check: the posting's company must be theirs.
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { titleRaw: true, kind: true, status: true, postedByUserId: true, company: { select: { ownerUserId: true } } },
    });
    if (!job || (job.postedByUserId !== userId && job.company?.ownerUserId !== userId)) {
      return NextResponse.json({ error: "Not your posting." }, { status: 404 });
    }
    const rows = await prisma.application.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, stage: true, coverNote: true, proposedRate: true, proposedCurrency: true, createdAt: true,
        profile: { select: { fullName: true, publicSlug: true, currentLocation: true, yearsExperience: true, photoUrl: true } },
      },
    });
    return NextResponse.json({ job: { title: job.titleRaw, kind: job.kind, status: job.status }, applications: rows });
  }

  // Member view: their own applications with each posting's basics.
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ applications: [] });
  const rows = await prisma.application.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, stage: true, createdAt: true,
      job: { select: { id: true, titleRaw: true, kind: true, companyName: true, status: true } },
    },
  });
  return NextResponse.json({ applications: rows });
}

export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in to apply." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Complete your profile first." }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobId = typeof body.jobId === "string" ? body.jobId : "";

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { source: true, status: true, kind: true, postedByUserId: true, company: { select: { ownerUserId: true } } },
  });
  // In-app applications exist ONLY for native postings — crawled jobs click
  // out to their real source, and pretending otherwise would fake a pipeline.
  if (!job || job.source !== "NATIVE") return NextResponse.json({ error: "This posting doesn't take applications here." }, { status: 404 });
  if (job.status !== "LIVE") return NextResponse.json({ error: "This posting is closed." }, { status: 409 });
  if (job.postedByUserId === userId || job.company?.ownerUserId === userId) return NextResponse.json({ error: "That's your own posting." }, { status: 409 });

  const coverNote = text(body.coverNote, 3000) || null;
  const proposedRate =
    job.kind === "PROJECT" && typeof body.proposedRate === "number" && Number.isFinite(body.proposedRate) && body.proposedRate > 0
      ? Math.round(body.proposedRate)
      : null;
  const proposedCurrency = proposedRate ? (/^[A-Z]{3}$/.test(String(body.proposedCurrency ?? "").toUpperCase()) ? String(body.proposedCurrency).toUpperCase() : "USD") : null;

  try {
    const app = await prisma.application.create({
      data: { jobId, profileId: profile.id, coverNote, proposedRate, proposedCurrency },
      select: { id: true },
    });
    return NextResponse.json({ id: app.id });
  } catch (err) {
    // Unique (jobId, profileId) — the DB is the lock against double-applying.
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "You've already applied to this one." }, { status: 409 });
    }
    console.error("application create failed:", err);
    return NextResponse.json({ error: "Couldn't send that — try again." }, { status: 502 });
  }
}
