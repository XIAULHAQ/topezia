/**
 * PATCH /api/postings/{id} — change the employer's own posting status.
 *
 * Closing sets JobStatus EXPIRED: it leaves the feed the same way a dead
 * crawled job does, and its pipeline stays readable.
 *
 * Publishing a DRAFT is NOT a flag flip. A draft deliberately skipped the
 * LLM extraction and the embedding (see lib/employer/publish.ts), so going
 * live has to run that enrichment first — otherwise the posting would enter
 * the feed with no embedding and never rank, or rank on junk extracted from
 * half-written text. That path also re-checks the publish bar, so a thin
 * draft can't sneak past the rules a direct publish enforces.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { publishDraft } from "@/lib/employer/publish";

export const maxDuration = 60; // publishing a draft runs extraction + embedding

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status =
    body.status === "LIVE" ? "LIVE" : body.status === "EXPIRED" ? "EXPIRED" : body.status === "DRAFT" ? "DRAFT" : null;
  if (!status) return NextResponse.json({ error: "status must be LIVE, EXPIRED or DRAFT." }, { status: 400 });

  // Any of the caller's companies — a posting under company B is still theirs
  // while company A is the active one.
  const owned = { id: params.id, OR: [{ postedByUserId: userId }, { company: { ownerUserId: userId } }] };

  // Read-then-act, but the WRITE below is still owner-scoped — this lookup
  // only decides which path to take, it isn't the authorization.
  const current = await prisma.job.findFirst({ where: owned, select: { id: true, status: true } });
  if (!current) return NextResponse.json({ error: "Not your posting." }, { status: 404 });

  if (current.status === "DRAFT" && status === "LIVE") {
    const res = await publishDraft(current.id);
    if (!res.ok) return NextResponse.json({ error: res.blockers.join(" "), blockers: res.blockers }, { status: 400 });
    return NextResponse.json({ ok: true, status: "LIVE" });
  }

  // Un-publishing back to draft is deliberately not offered: the posting has
  // already been seen, and applicants may already sit in its pipeline. Close
  // it instead — that keeps the pipeline readable.
  if (status === "DRAFT") {
    return NextResponse.json({ error: "A published posting can be closed, but not returned to draft." }, { status: 400 });
  }

  const r = await prisma.job.updateMany({ where: owned, data: { status } });
  if (r.count === 0) return NextResponse.json({ error: "Not your posting." }, { status: 404 });
  return NextResponse.json({ ok: true, status });
}
