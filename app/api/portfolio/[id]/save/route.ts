/**
 * POST   /api/portfolio/{id}/save — save it.
 * DELETE /api/portfolio/{id}/save — unsave it.
 *
 * Saving is private: it's a bookmark for the person saving, not a public
 * endorsement. The grid shows a save COUNT, but never who.
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

  // Only published work can be saved — otherwise a guessed id would confirm
  // that someone's unpublished draft exists.
  const exists = await prisma.portfolio.findFirst({
    where: { id: params.id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not-found" }, { status: 404 });

  await prisma.portfolioSave.upsert({
    where: { profileId_portfolioId: { profileId, portfolioId: exists.id } },
    create: { profileId, portfolioId: exists.id },
    update: {},
  });
  return NextResponse.json({ saved: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  await prisma.portfolioSave.deleteMany({ where: { profileId, portfolioId: params.id } });
  return NextResponse.json({ saved: false });
}
