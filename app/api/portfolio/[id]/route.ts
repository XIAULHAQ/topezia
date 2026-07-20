/**
 * PATCH  /api/portfolio/{id} — update, publish or unpublish.
 * DELETE /api/portfolio/{id} — remove it, and its images from storage.
 *
 * Ownership is enforced by scoping every write to `{ id, profileId }`, so a
 * caller who guesses another member's id gets a 404 and learns nothing about
 * whether it exists.
 */
import { NextResponse } from "next/server";
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

  return NextResponse.json({ portfolio: updated });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const profileId = await ownProfileId();
  if (!profileId) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const existing = await prisma.portfolio.findFirst({
    where: { id: params.id, profileId },
    select: { id: true, coverPath: true, media: { select: { path: true, kind: true } } },
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

  return NextResponse.json({ deleted: true });
}
