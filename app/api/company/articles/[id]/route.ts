/**
 * GET    /api/company/articles/{id} — load one into the editor.
 * PATCH  /api/company/articles/{id} — save it.
 * DELETE /api/company/articles/{id} — remove it, and its cover from storage.
 *
 * Unlike a piece of work, an article's slug CAN change: it is the address the
 * employer chose, the editor shows it, and the old URL was only ever live if
 * the article was published. Changing it on a published article does break the
 * old link — the editor says so rather than silently preventing it.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateArticle, type ArticleInput } from "@/lib/company/article";
import { removeObjects } from "@/lib/company/cleanup";
import { COMPANY_BUCKET } from "@/lib/company/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const article = await prisma.companyArticle.findFirst({
    where: { id: params.id, companyId: auth.owner.companyId },
  });
  if (!article) return NextResponse.json({ error: "That article no longer exists." }, { status: 404 });
  return NextResponse.json({ article, companySlug: auth.owner.slug });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  const existing = await prisma.companyArticle.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, slug: true, publishedAt: true, coverPath: true },
  });
  if (!existing) return NextResponse.json({ error: "That article no longer exists." }, { status: 404 });

  let body: ArticleInput;
  try {
    body = (await req.json()) as ArticleInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateArticle(body, companyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const v = result.value;

  try {
    const article = await prisma.companyArticle.update({
      where: { id: existing.id },
      data: {
        ...v,
        // Publishing stamps the date once. Editing a live article must not
        // re-date it — that is what updatedAt is for.
        publishedAt: v.status === "PUBLISHED" ? existing.publishedAt ?? new Date() : null,
      },
      select: { id: true, slug: true, status: true },
    });

    if (existing.coverPath && existing.coverPath !== v.coverPath) {
      await removeObjects(COMPANY_BUCKET, [existing.coverPath]);
    }

    revalidatePath(`/company/${companySlug}/articles`);
    revalidatePath(`/company/${companySlug}/articles/${existing.slug}`);
    if (article.slug !== existing.slug) revalidatePath(`/company/${companySlug}/articles/${article.slug}`);
    return NextResponse.json({ article });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "You already have an article at that address — pick a different one." }, { status: 409 });
    }
    console.error("[company/articles] save failed:", err);
    return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  const existing = await prisma.companyArticle.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, slug: true, coverPath: true },
  });
  if (!existing) return NextResponse.json({ error: "That article no longer exists." }, { status: 404 });

  await prisma.companyArticle.delete({ where: { id: existing.id } });
  await removeObjects(COMPANY_BUCKET, [existing.coverPath]);

  revalidatePath(`/company/${companySlug}/articles`);
  revalidatePath(`/company/${companySlug}/articles/${existing.slug}`);
  return NextResponse.json({ deleted: true });
}
