/**
 * GET  /api/hq/posts — list every post (draft + published) for the admin table.
 * POST /api/hq/posts — create a post.
 *
 * Gated by the /hq password session, re-checked here independently of the
 * page-level gate (defense in depth — same posture as every /api/hq/* route).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { validate, type PostInput } from "@/lib/blog/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = await prisma.post.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, status: true, tags: true, publishedAt: true, updatedAt: true },
  });

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const post = await prisma.post.create({
      data: { ...v, publishedAt: v.status === "PUBLISHED" ? new Date() : null },
      select: { id: true, slug: true, status: true },
    });
    return NextResponse.json({ post });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That slug is already in use — try a different one." }, { status: 409 });
    }
    console.error("[hq/posts] create failed:", err);
    return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 502 });
  }
}
