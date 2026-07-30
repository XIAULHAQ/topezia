/**
 * PATCH  /api/portfolio/{id} — update, publish or unpublish.
 * DELETE /api/portfolio/{id} — remove it, and its images from storage.
 *
 * Ownership is enforced by scoping every write to `{ id, profileId }`, so a
 * caller who guesses another member's id gets a 404 and learns nothing about
 * whether it exists.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { validate, writeMedia, type PortfolioInput } from "@/lib/portfolio/save";
import { PORTFOLIO_BUCKET } from "@/lib/portfolio/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownProfileId(): Promise<string | null> {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return null;
  const p = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return p?.id ?? null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const existing = await prisma.portfolio.findFirst({
    where: { id: params.id, profileId },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });

  let body: PortfolioInput;
  try {
    body = (await request.json()) as PortfolioInput;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const result = validate(body, profileId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const v = result.value;

  const updated = await prisma.portfolio.update({
    where: { id: existing.id },
    data: {
      title: v.title,
      description: v.description,
      category: v.category,
      coverPath: v.coverPath,
      coverWidth: v.coverWidth,
      coverHeight: v.coverHeight,
      skills: v.skills,
      technologies: v.technologies,
      status: v.publish ? "PUBLISHED" : "DRAFT",
      // First publish stamps the date; re-publishing later keeps the original,
      // so "published 3 months ago" doesn't reset every time a typo is fixed.
      publishedAt: v.publish ? existing.publishedAt ?? new Date() : existing.publishedAt,
    },
    select: { id: true, slug: true, status: true },
  });

  await writeMedia(existing.id, v.media);

  // Publishing changed the page but the visitor kept seeing "This is a draft".
  //
  // `export const dynamic = "force-dynamic"` on the portfolio page stops the
  // SERVER caching it, which is what everyone checks first — but it says nothing
  // about the App Router's CLIENT-side Router Cache, which holds the RSC payload
  // for an already-visited route. The draft page was visited on the way to the
  // editor, so `router.push()` back to it replayed that cached payload, banner
  // and all, until the entry aged out.
  //
  // Invalidating here rather than only in the editor keeps it true for any
  // caller: a second tab, a different device, or a future publish button
  // somewhere else all get a fresh page.
  revalidatePath(`/portfolio/${updated.slug}`);
  // The lists that show status or published work, for the same reason.
  revalidatePath("/portfolio/mine");
  revalidatePath("/profile");
  const owner = await prisma.profile.findUnique({ where: { id: profileId }, select: { publicSlug: true } });
  if (owner?.publicSlug) revalidatePath(`/p/${owner.publicSlug}`);

  return NextResponse.json({ portfolio: updated });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const existing = await prisma.portfolio.findFirst({
    where: { id: params.id, profileId },
    select: { id: true, slug: true, coverPath: true, media: { select: { path: true, kind: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });

  // Collect the objects first: once the rows are gone we no longer know which
  // files belonged to this portfolio, and they'd sit in the bucket forever.
  const paths = [
    ...(existing.coverPath ? [existing.coverPath] : []),
    ...existing.media.filter((m) => m.kind === "IMAGE").map((m) => m.path),
  ];

  // Rows first. Media and saves cascade. If storage cleanup then fails the user
  // still sees the portfolio gone, and the leftover is orphaned bytes rather
  // than a half-deleted record.
  await prisma.portfolio.delete({ where: { id: existing.id } });

  if (paths.length) {
    const admin = createAdminClient();
    if (admin) {
      const { error } = await admin.storage.from(PORTFOLIO_BUCKET).remove(paths);
      if (error) console.error("[portfolio/delete] storage cleanup failed:", error.message);
    }
  }

  // Same Router Cache reason as PATCH: without this the deleted piece keeps
  // appearing in the lists a client has already visited.
  revalidatePath(`/portfolio/${existing.slug}`);
  revalidatePath("/portfolio/mine");
  revalidatePath("/profile");
  const owner = await prisma.profile.findUnique({ where: { id: profileId }, select: { publicSlug: true } });
  if (owner?.publicSlug) revalidatePath(`/p/${owner.publicSlug}`);

  return NextResponse.json({ deleted: true });
}
