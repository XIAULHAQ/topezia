/**
 * GET  /api/company/articles — the owner's articles, drafts included.
 * POST /api/company/articles — create one.
 *
 * The mirror of /api/hq/posts, with a different table, a different gate and a
 * different sanitizer. See lib/company/article.ts for why company writing
 * cannot share the first-party blog's write path.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateArticle, type ArticleInput } from "@/lib/company/article";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ARTICLES = 100;

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const articles = await prisma.companyArticle.findMany({
    where: { companyId: auth.owner.companyId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, status: true, tags: true, publishedAt: true, updatedAt: true },
  });
  return NextResponse.json({ articles, companySlug: auth.owner.slug });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, slug: companySlug } = auth.owner;

  if (!rateLimit(`company-article:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: ArticleInput;
  try {
    body = (await req.json()) as ArticleInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if ((await prisma.companyArticle.count({ where: { companyId } })) >= MAX_ARTICLES) {
    return NextResponse.json({ error: `You can publish up to ${MAX_ARTICLES} articles.` }, { status: 409 });
  }

  const result = validateArticle(body, companyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const v = result.value;

  try {
    const article = await prisma.companyArticle.create({
      data: { ...v, companyId, publishedAt: v.status === "PUBLISHED" ? new Date() : null },
      select: { id: true, slug: true, status: true },
    });
    revalidatePath(`/company/${companySlug}/articles`);
    return NextResponse.json({ article });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "You already have an article at that address — pick a different one." }, { status: 409 });
    }
    console.error("[company/articles] create failed:", err);
    return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 502 });
  }
}
