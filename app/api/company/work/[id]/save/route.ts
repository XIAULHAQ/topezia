/**
 * POST   /api/company/work/{id}/save — save it.
 * DELETE /api/company/work/{id}/save — unsave it.
 *
 * Saving is private: a bookmark for the person saving, never a public
 * endorsement, and the company is not told who saved their work.
 *
 * Note the auth here is deliberately NOT requireCompanyOwner, unlike its
 * sibling `/api/company/work/{id}`. That route is the owner editing their own
 * work; this one is any signed-in member reacting to someone else's. Same URL
 * prefix, opposite audience — mirroring /api/portfolio/{id} and its
 * save/like children, which have exactly the same split.
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

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  // Published only — otherwise a guessed id would confirm that a company's
  // unpublished draft exists.
  const exists = await prisma.companyWork.findFirst({
    where: { id: params.id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not-found" }, { status: 404 });

  await prisma.companyWorkSave.upsert({
    where: { profileId_workId: { profileId, workId: exists.id } },
    create: { profileId, workId: exists.id },
    update: {},
  });
  return NextResponse.json({ saved: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  await prisma.companyWorkSave.deleteMany({ where: { profileId, workId: params.id } });
  return NextResponse.json({ saved: false });
}
