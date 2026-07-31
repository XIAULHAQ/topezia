/**
 * PATCH  /api/company/work/{id} — edit one piece of work.
 * DELETE /api/company/work/{id} — remove it, and its images from storage.
 *
 * The ownership check is `findFirst({ id, companyId })`, not "load then
 * compare": a query that can only ever return your own row cannot be talked
 * into returning someone else's.
 *
 * The slug never changes on edit. It is a public URL that may already be
 * linked from a proposal or an email, and silently renaming it would break
 * those to save the employer a redirect they never asked for.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateWork, type WorkInput } from "@/lib/company/save";
import { removeObjects } from "@/lib/company/cleanup";
import { COMPANY_BUCKET } from "@/lib/company/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  const existing = await prisma.companyWork.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, slug: true, status: true, publishedAt: true, coverPath: true, media: { select: { path: true, kind: true } } },
  });
  if (!existing) return NextResponse.json({ error: "That work no longer exists." }, { status: 404 });

  let body: WorkInput;
  try {
    body = (await req.json()) as WorkInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateWork(body, companyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { media, ...v } = result.value;

  // Media is replaced wholesale rather than diffed — simpler, and the editor
  // always sends the full list. Whatever is no longer referenced gets deleted
  // from the bucket afterwards.
  //
  // Only IMAGE rows carry a storage path. A VIDEO row's `path` is the provider
  // id, so including one here would ask Supabase to delete an object called
  // "dQw4w9WgXcQ" — harmless, but it is not a file and never was.
  const kept = new Set([
    ...media.filter((m) => m.kind === "IMAGE").map((m) => m.path),
    ...(v.coverPath ? [v.coverPath] : []),
  ]);
  const orphaned = [
    existing.coverPath,
    ...existing.media.filter((m) => m.kind === "IMAGE").map((m) => m.path),
  ].filter((p): p is string => !!p && !kept.has(p));

  const work = await prisma.$transaction(async (tx) => {
    await tx.companyWorkMedia.deleteMany({ where: { workId: existing.id } });
    return tx.companyWork.update({
      where: { id: existing.id },
      data: {
        ...v,
        // First publish stamps the date; re-publishing something already live
        // must not backdate or bump it.
        publishedAt: v.status === "PUBLISHED" ? existing.publishedAt ?? new Date() : null,
        media: media.length ? { createMany: { data: media } } : undefined,
      },
      include: { media: { orderBy: { position: "asc" } } },
    });
  });

  await removeObjects(COMPANY_BUCKET, orphaned);

  revalidatePath(`/company/${companySlug}`);
  revalidatePath(`/company/${companySlug}/work/${existing.slug}`);
  return NextResponse.json({ work });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  const existing = await prisma.companyWork.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, slug: true, coverPath: true, media: { select: { path: true, kind: true } } },
  });
  if (!existing) return NextResponse.json({ error: "That work no longer exists." }, { status: 404 });

  // Collect the paths first: once the rows are gone we no longer know which
  // objects belonged to this work, and they would sit in the bucket forever.
  // IMAGE rows only — a VIDEO row's path is a provider id, not a file.
  const paths = [existing.coverPath, ...existing.media.filter((m) => m.kind === "IMAGE").map((m) => m.path)];

  await prisma.companyWork.delete({ where: { id: existing.id } }); // media cascades
  await removeObjects(COMPANY_BUCKET, paths);

  revalidatePath(`/company/${companySlug}`);
  revalidatePath(`/company/${companySlug}/work/${existing.slug}`);
  return NextResponse.json({ deleted: true });
}
