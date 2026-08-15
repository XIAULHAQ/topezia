/**
 * GET    /api/network/import/[id] — read one import's matched results.
 * DELETE /api/network/import/[id] — I'm done with this; destroy it now.
 *
 * The GET is scoped to the importing profile, so an id guessed from elsewhere
 * reads nothing. Degrees are recomputed on read rather than trusted from the
 * stored payload: the member may have connected with someone in another tab
 * between the import and this page load, and showing a stale "Connect" button
 * would send a request that quietly does nothing.
 *
 * Expiry is enforced HERE as well as by the sweep, because a sweep that has not
 * run yet must not be the reason an expired address book is still readable.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { degreesTo, profileIdFor } from "@/lib/network/connections";
import { decryptJson } from "@/lib/crypto/secrets";
import type { MatchResult } from "@/lib/network/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owned(id: string) {
  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) return { ok: false as const, status: 401, error: "Sign in first." };

  const profileId = await profileIdFor(userId);
  if (!profileId) return { ok: false as const, status: 409, error: "Create your profile first." };

  const row = await prisma.contactImport.findFirst({
    where: { id, profileId },
    select: { id: true, payload: true, total: true, expiresAt: true },
  });
  if (!row) return { ok: false as const, status: 404, error: "That import is gone." };

  return { ok: true as const, profileId, row };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const found = await owned(params.id);
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });
  const { row, profileId } = found;

  if (row.expiresAt.getTime() < Date.now()) {
    // Do not serve it, and do not leave it lying around either.
    await prisma.contactImport.delete({ where: { id: row.id } }).catch(() => {});
    return NextResponse.json(
      { error: "That import has expired — connect Google again to refresh it.", expired: true },
      { status: 410 }
    );
  }

  const payload = decryptJson<MatchResult>(row.payload);
  if (!payload) {
    // Wrong key, or a rotated one. Treat it as no data rather than guessing.
    return NextResponse.json({ error: "We couldn't read that import. Please run it again." }, { status: 500 });
  }

  const degrees = await degreesTo(profileId, payload.members.map((m) => m.profileId));
  const members = payload.members.map((m) => ({ ...m, degree: degrees.get(m.profileId) ?? m.degree }));

  return NextResponse.json({
    id: row.id,
    scanned: row.total,
    truncated: payload.truncated,
    members,
    invitable: payload.invitable,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const found = await owned(params.id);
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });

  await prisma.contactImport.delete({ where: { id: found.row.id } }).catch(() => {});
  return NextResponse.json({ deleted: true });
}
