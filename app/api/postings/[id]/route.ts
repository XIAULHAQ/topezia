/**
 * PATCH /api/postings/{id} — close or reopen the employer's own posting.
 * Closing sets JobStatus EXPIRED: it leaves the feed the same way a dead
 * crawled job does, and its pipeline stays readable.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status === "LIVE" ? "LIVE" : body.status === "EXPIRED" ? "EXPIRED" : null;
  if (!status) return NextResponse.json({ error: "status must be LIVE or EXPIRED." }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "No company." }, { status: 404 });

  // Owner-scoped write — the where clause is the authorization.
  const r = await prisma.job.updateMany({ where: { id: params.id, companyId: company.id }, data: { status } });
  if (r.count === 0) return NextResponse.json({ error: "Not your posting." }, { status: 404 });
  return NextResponse.json({ ok: true, status });
}
