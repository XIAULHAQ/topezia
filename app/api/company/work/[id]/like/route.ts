/**
 * POST   /api/company/work/{id}/like — like it.
 * DELETE /api/company/work/{id}/like — unlike it.
 *
 * Public appreciation with a count, as opposed to Save, which is private. The
 * count is shown on the work's own page and nowhere else: it never orders the
 * company page, never feeds matching, and never appears on a profile. That is
 * the line that keeps it appreciation rather than a leaderboard — the same
 * rule PortfolioLike carries, for the same reason.
 *
 * Auth is a signed-in member, NOT the company owner — see the note in the
 * sibling save route.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownProfileId(): Promise<string | null> {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return null;
  const p = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return p?.id ?? null;
}

const count = (workId: string) => prisma.companyWorkLike.count({ where: { workId } });

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const exists = await prisma.companyWork.findFirst({
    where: { id: params.id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not-found" }, { status: 404 });

  // upsert, not create: the unique index already makes a second like a no-op,
  // and a retried request should read as success rather than a 500.
  await prisma.companyWorkLike.upsert({
    where: { profileId_workId: { profileId, workId: exists.id } },
    create: { profileId, workId: exists.id },
    update: {},
  });
  return NextResponse.json({ liked: true, likes: await count(exists.id) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  await prisma.companyWorkLike.deleteMany({ where: { profileId, workId: params.id } });
  return NextResponse.json({ liked: false, likes: await count(params.id) });
}
