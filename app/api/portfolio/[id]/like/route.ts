/**
 * POST   /api/portfolio/{id}/like — like it.
 * DELETE /api/portfolio/{id}/like — unlike it.
 *
 * The public twin of /save. Saving is a private bookmark; liking is a number
 * the creator and every visitor can see, so it needs a real account behind it
 * — an anonymous cookie is resettable, and a count anyone can pump by
 * clearing their browser is worse than no count at all.
 *
 * Both verbs return the fresh total, because the client is optimistic and the
 * server's number is the one that settles it.
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

const count = (portfolioId: string) => prisma.portfolioLike.count({ where: { portfolioId } });

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  // Only published work can be liked — otherwise a guessed id would confirm
  // that someone's unpublished draft exists.
  const exists = await prisma.portfolio.findFirst({
    where: { id: params.id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not-found" }, { status: 404 });

  // upsert, not create: the unique index already makes a second like a no-op,
  // and a retried request should read as success rather than a 500.
  await prisma.portfolioLike.upsert({
    where: { profileId_portfolioId: { profileId, portfolioId: exists.id } },
    create: { profileId, portfolioId: exists.id },
    update: {},
  });
  return NextResponse.json({ liked: true, likes: await count(exists.id) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  await prisma.portfolioLike.deleteMany({ where: { profileId, portfolioId: params.id } });
  return NextResponse.json({ liked: false, likes: await count(params.id) });
}
