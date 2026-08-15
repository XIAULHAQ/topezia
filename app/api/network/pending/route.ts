/**
 * GET /api/network/pending — what the sidebar badge shows: requests waiting on
 * an answer, plus acceptances the member hasn't seen yet.
 *
 * Deliberately tiny and separate from GET /api/network. This one is called from
 * AppShell, which renders on EVERY signed-in page, so it is two indexed COUNTs
 * and nothing else — no joins, no profile cards, no role lookups. The full
 * network payload stays on /network where it is actually rendered. It also must
 * NOT stamp networkSeenAt, or merely being on any page would clear the badge.
 *
 * Signed out is 200 with zeroes, not a 401: the badge is decoration, and a
 * console full of 401s on every page load for every logged-out visitor is
 * noise that hides real errors.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { badgeCounts } from "@/lib/network/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTHING = { pending: 0, accepted: 0, total: 0 };

export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) return NextResponse.json(NOTHING);

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, networkSeenAt: true },
  });
  if (!profile) return NextResponse.json(NOTHING);

  return NextResponse.json(await badgeCounts(profile.id, profile.networkSeenAt));
}
