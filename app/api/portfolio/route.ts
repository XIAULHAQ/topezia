/**
 * POST /api/portfolio — create a portfolio.
 * GET  /api/portfolio — the caller's own portfolios, drafts included.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { validate, makeSlug, writeMedia, type PortfolioInput } from "@/lib/portfolio/save";
import { portfolioImageUrl } from "@/lib/portfolio/storage";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownProfileId(): Promise<string | null> {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return null;
  const p = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return p?.id ?? null;
}

export async function GET() {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const rows = await prisma.portfolio.findMany({
    where: { profileId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true, slug: true, title: true, category: true, status: true,
      coverPath: true, coverWidth: true, coverHeight: true, updatedAt: true,
      _count: { select: { media: true } },
    },
  });

  return NextResponse.json({
    portfolios: rows.map((r) => ({
      ...r,
      coverUrl: portfolioImageUrl(r.coverPath),
      mediaCount: r._count.media,
      _count: undefined,
    })),
  });
}

export async function POST(request: Request) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  // A published portfolio is an indexed page in our sitemap, so bulk creation
  // is the shape worth bounding. Far above anyone's real output in an hour.
  if (!rateLimit(`portfolio-create:${profileId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: PortfolioInput;
  try {
    body = (await request.json()) as PortfolioInput;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const result = validate(body, profileId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const v = result.value;

  const created = await prisma.portfolio.create({
    data: {
      profileId,
      slug: makeSlug(v.title),
      title: v.title,
      description: v.description,
      category: v.category,
      coverPath: v.coverPath,
      coverWidth: v.coverWidth,
      coverHeight: v.coverHeight,
      skills: v.skills,
      technologies: v.technologies,
      status: v.publish ? "PUBLISHED" : "DRAFT",
      publishedAt: v.publish ? new Date() : null,
    },
    select: { id: true, slug: true, status: true },
  });

  if (v.media.length) await writeMedia(created.id, v.media);

  // A brand-new piece has no cached page of its own, but the LISTS that should
  // now include it do — see the Router Cache note in ./[id]/route.ts.
  revalidatePath("/portfolio/mine");
  revalidatePath("/profile");
  const owner = await prisma.profile.findUnique({ where: { id: profileId }, select: { publicSlug: true } });
  if (owner?.publicSlug) revalidatePath(`/p/${owner.publicSlug}`);

  return NextResponse.json({ portfolio: created }, { status: 201 });
}
