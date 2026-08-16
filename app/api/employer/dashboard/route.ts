/**
 * GET /api/employer/dashboard — everything the employer overview renders, in
 * one round trip.
 *
 * One endpoint rather than five because the dashboard's cards are read
 * together and several of them share the same posting set — splitting them
 * would re-derive "which postings are mine" per request and risk two cards
 * disagreeing about it.
 *
 * Match scores on the awaiting-review list come from CACHED MatchScore rows
 * only. If an applicant has no cached score we send null and the UI omits the
 * badge, rather than either inventing a number or spending a live LLM rerank
 * per applicant on every dashboard load.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { employerStats, companyChecklist, strengthPct, ownedPostingsWhere, AWAITING_REVIEW_DAYS } from "@/lib/employer/stats";
import { companyLogoUrl } from "@/lib/company/storage";
import { activeCompany } from "@/lib/company/active";

export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ authed: false, company: null, postings: [] }, { status: 200 });

  const company = await activeCompany(userId);

  const rows = await prisma.job.findMany({
    where: ownedPostingsWhere(userId, company?.id ?? null),
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, titleRaw: true, status: true, createdAt: true,
      locationState: true, country: true, remoteType: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
      applications: { select: { stage: true } },
      _count: { select: { views: true } },
    },
  });

  const postings = rows.map((r) => {
    const byStage: Record<string, number> = {};
    for (const a of r.applications) byStage[a.stage] = (byStage[a.stage] ?? 0) + 1;
    const { applications, _count, ...rest } = r;
    return { ...rest, total: applications.length, byStage, views: _count.views };
  });

  const stats = await employerStats(userId, company?.id ?? null);

  const checklist = companyChecklist(
    company,
    rows.length > 0,
    rows.some((r) => r.status === "LIVE")
  );

  // Who's actually waiting on a decision — the "needs your review" list.
  // Oldest first: the point of the card is that someone has been ignored.
  const jobIds = rows.map((r) => r.id);
  const waiting = jobIds.length
    ? await prisma.application.findMany({
        where: { jobId: { in: jobIds }, stage: "APPLIED" },
        orderBy: { createdAt: "asc" },
        take: 6,
        select: {
          id: true, jobId: true, createdAt: true, coverNote: true,
          job: { select: { titleRaw: true } },
          profile: {
            select: {
              id: true, fullName: true, publicSlug: true, photoUrl: true,
              currentLocation: true, yearsExperience: true, seniority: true,
            },
          },
        },
      })
    : [];

  // Cached scores only — see the header comment.
  const scores = waiting.length
    ? await prisma.matchScore.findMany({
        where: {
          OR: waiting.map((w) => ({ profileId: w.profile.id, jobId: w.jobId })),
        },
        select: { profileId: true, jobId: true, score: true },
      })
    : [];
  const scoreBy = new Map(scores.map((s) => [`${s.profileId}:${s.jobId}`, s.score]));

  const applicants = waiting.map((w) => ({
    id: w.id,
    jobId: w.jobId,
    jobTitle: w.job.titleRaw,
    appliedAt: w.createdAt.toISOString(),
    waitingDays: Math.floor((Date.now() - w.createdAt.getTime()) / 86_400_000),
    hasCoverNote: !!w.coverNote?.trim(),
    profileId: w.profile.id,
    fullName: w.profile.fullName,
    publicSlug: w.profile.publicSlug,
    photoUrl: w.profile.photoUrl,
    currentLocation: w.profile.currentLocation,
    yearsExperience: w.profile.yearsExperience,
    seniority: w.profile.seniority,
    match: scoreBy.get(`${w.profile.id}:${w.jobId}`) ?? null,
  }));

  return NextResponse.json({
    authed,
    // logoPath is a storage path; the client only ever needs the URL, and
    // deriving it here keeps the bucket layout out of the browser.
    company: company ? { ...company, logoUrl: companyLogoUrl(company.logoPath) } : null,
    postings,
    stats,
    checklist,
    strength: strengthPct(checklist),
    applicants,
    awaitingReviewDays: AWAITING_REVIEW_DAYS,
  });
}
