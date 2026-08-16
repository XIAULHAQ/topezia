/**
 * /api/hq/errors — the error log behind /hq/errors.
 *
 * GET    → { open: [...], resolved: [...] } newest-seen first
 * PATCH  → { id, status: "RESOLVED" | "OPEN", note? }   mark one
 *          { all: "RESOLVED" }                          mark every open one
 * DELETE → clear every RESOLVED row (the "cleared once fixed" step)
 *
 * Requires the signed /hq session cookie (lib/hq-auth.ts), like every other
 * /api/hq route, and re-checks it independently of the page's own gate.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();
  const [open, resolved] = await Promise.all([
    prisma.errorLog.findMany({ where: { status: "OPEN" }, orderBy: { lastSeenAt: "desc" }, take: 500 }),
    prisma.errorLog.findMany({ where: { status: "RESOLVED" }, orderBy: { resolvedAt: "desc" }, take: 200 }),
  ]);
  return NextResponse.json({ open, resolved });
}

export async function PATCH(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status === "RESOLVED" || body.all === "RESOLVED" ? "RESOLVED" : body.status === "OPEN" ? "OPEN" : null;
  if (!status) return NextResponse.json({ error: "status must be RESOLVED or OPEN" }, { status: 400 });
  const data = { status, resolvedAt: status === "RESOLVED" ? new Date() : null, ...(typeof body.note === "string" ? { note: body.note.slice(0, 1000) || null } : {}) };

  if (body.all === "RESOLVED") {
    const r = await prisma.errorLog.updateMany({ where: { status: "OPEN" }, data });
    return NextResponse.json({ updated: r.count });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const r = await prisma.errorLog.updateMany({ where: { id }, data });
  return NextResponse.json({ updated: r.count });
}

export async function DELETE(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();
  const r = await prisma.errorLog.deleteMany({ where: { status: "RESOLVED" } });
  return NextResponse.json({ deleted: r.count });
}
