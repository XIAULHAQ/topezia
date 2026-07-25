/** Published portfolio pieces a REVIEW can be requested about. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { portfolioImageUrl } from "@/lib/portfolio/storage";

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const rows = await prisma.portfolio.findMany({
    where: { profileId: profile.id, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 30,
    select: { id: true, title: true, slug: true, coverPath: true },
  });
  return NextResponse.json({
    works: rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, thumb: portfolioImageUrl(r.coverPath) })),
  });
}
