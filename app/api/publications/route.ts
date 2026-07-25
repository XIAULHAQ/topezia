/**
 * /api/publications — the member's own publications, full CRUD.
 *
 * Owner-scoped throughout: every write's where-clause carries profileId, so
 * a guessed id belonging to someone else matches nothing. Public rendering
 * happens in app/p/profile-data.ts, not here.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { PUBLICATION_LIMITS, sanitizePublication } from "@/lib/publications/doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me() {
  const { userId } = await currentIdentity();
  if (!userId) return null;
  return prisma.profile.findUnique({ where: { userId }, select: { id: true } });
}

const SELECT = {
  id: true, type: true, title: true, authors: true, venue: true, year: true,
  doi: true, isbn: true, url: true, abstract: true, position: true,
} as const;

export async function GET() {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const publications = await prisma.publication.findMany({
    where: { profileId: profile.id },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: SELECT,
  });
  return NextResponse.json({ publications });
}

export async function POST(req: NextRequest) {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const p = sanitizePublication(body);
  if (!p) return NextResponse.json({ error: "A publication needs at least a title." }, { status: 400 });

  const count = await prisma.publication.count({ where: { profileId: profile.id } });
  if (count >= PUBLICATION_LIMITS.perProfile) {
    return NextResponse.json({ error: `Up to ${PUBLICATION_LIMITS.perProfile} publications per profile.` }, { status: 429 });
  }

  const row = await prisma.publication.create({
    data: { profileId: profile.id, ...p, position: count },
    select: SELECT,
  });
  return NextResponse.json({ publication: row });
}

export async function PATCH(req: NextRequest) {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const p = sanitizePublication(body);
  if (!id || !p) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const done = await prisma.publication.updateMany({
    where: { id, profileId: profile.id },
    data: p,
  });
  if (!done.count) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = await prisma.publication.findUnique({ where: { id }, select: SELECT });
  return NextResponse.json({ publication: row });
}

export async function DELETE(req: NextRequest) {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const done = await prisma.publication.deleteMany({ where: { id, profileId: profile.id } });
  if (!done.count) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
