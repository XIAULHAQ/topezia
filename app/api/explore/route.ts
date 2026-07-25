/**
 * GET /api/explore?role=<Role name> — a small, instant list of live jobs and
 * freelance projects for one role.
 *
 * Deliberately NOT the matcher: this runs for someone who has existed as a
 * user for about four seconds and has no embedding yet, so there is nothing
 * to score against. A role-scoped query is honest about what it is — "open
 * Backend Engineer roles", not "your matches" — and returns immediately.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeHtmlEntities } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roleName = (new URL(req.url).searchParams.get("role") ?? "").trim().slice(0, 80);
  if (!roleName) return NextResponse.json({ jobs: [], projects: [], roleName: null });

  const role = await prisma.role.findFirst({
    where: { name: { equals: roleName, mode: "insensitive" } },
    select: { id: true, name: true, verticalId: true },
  });
  if (!role) return NextResponse.json({ jobs: [], projects: [], roleName: null });

  const pick = {
    id: true, titleRaw: true, companyName: true, kind: true, sourceUrl: true,
    locationState: true, country: true, remoteType: true,
    salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
  } as const;

  // Jobs are role-scoped; freelance projects are scoped to the role's whole
  // vertical, because project titles rarely map onto a single job title and a
  // strict role filter usually returns nothing at all.
  const [jobs, projects] = await Promise.all([
    prisma.job.findMany({
      where: { status: "LIVE", kind: "JOB", roleId: role.id },
      orderBy: { lastVerifiedAt: "desc" },
      take: 6,
      select: pick,
    }),
    prisma.job.findMany({
      where: { status: "LIVE", kind: "PROJECT", verticalId: role.verticalId },
      orderBy: { lastVerifiedAt: "desc" },
      take: 4,
      select: pick,
    }),
  ]);

  const shape = (r: (typeof jobs)[number]) => ({
    id: r.id,
    title: decodeHtmlEntities(r.titleRaw),
    company: decodeHtmlEntities(r.companyName),
    kind: r.kind,
    place: r.remoteType?.startsWith("REMOTE") ? "Remote" : [r.locationState, r.country].filter(Boolean).join(", ") || null,
    salaryMin: r.salaryMin, salaryMax: r.salaryMax,
    salaryCurrency: r.salaryCurrency, salaryPeriod: r.salaryPeriod,
  });

  return NextResponse.json({ roleName: role.name, jobs: jobs.map(shape), projects: projects.map(shape) });
}
