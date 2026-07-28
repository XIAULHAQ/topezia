/**
 * GET    /api/hq/posts/{id} — full record, to hydrate the editor.
 * PATCH  /api/hq/posts/{id} — update, including publish/unpublish.
 * DELETE /api/hq/posts/{id} — remove it, and its cover image from storage.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validate, type PostInput } from "@/lib/blog/save";
import { BLOG_BUCKET } from "@/lib/blog/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const post = await prisma.post.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "not-found" }, { status: 404 });

  return NextResponse.json({ post });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.post.findUnique({ where: { id: params.id }, select: { id: true, publishedAt: true } });
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });

  let body: PostInput;
  try {
    body = (await req.json()) as PostInput;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const result = validate(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const v = result.value;

  try {
    const post = await prisma.post.update({
      where: { id: existing.id },
      data: {
        ...v,
        // First publish stamps the date; re-publishing later (after editing a
        // typo) keeps the original, so "published 3 months ago" doesn't reset.
        publishedAt: v.status === "PUBLISHED" ? existing.publishedAt ?? new Date() : existing.publishedAt,
      },
      select: { id: true, slug: true, status: true },
    });
    return NextResponse.json({ post });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That slug is already in use — try a different one." }, { status: 409 });
    }
    console.error("[hq/posts] update failed:", err);
    return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.post.findUnique({ where: { id: params.id }, select: { id: true, coverImage: true } });
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });

  await prisma.post.delete({ where: { id: existing.id } });

  if (existing.coverImage) {
    const admin = createAdminClient();
    if (admin) {
      const { error } = await admin.storage.from(BLOG_BUCKET).remove([existing.coverImage]);
      if (error) console.error("[hq/posts/delete] storage cleanup failed:", error.message);
    }
  }

  return NextResponse.json({ deleted: true });
}
