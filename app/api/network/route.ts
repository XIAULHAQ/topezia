/**
 * GET /api/network — my connections, the requests waiting on me, the ones I'm
 * waiting on, and the invitations I've sent.
 *
 * One call rather than four, because the hub renders all of it at once and four
 * spinners resolving separately is worse than one.
 *
 * THIS GET HAS A SIDE EFFECT: it stamps networkSeenAt, which is what clears the
 * acceptance half of the sidebar badge. A GET that writes is not free of sin,
 * but the alternatives are worse. A separate POST /seen would add a round trip
 * and a failure mode where the badge never clears because the second call was
 * dropped; doing it client-side would trust the browser to report that a human
 * looked. Opening the page IS the event, so the request that renders the page
 * is the honest place to record it.
 *
 * The PREVIOUS value is read first and used to flag which connections are new,
 * so the member can see what the badge was counting rather than watching a
 * number vanish into an undifferentiated list.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { loadNetwork } from "@/lib/network/connections";
import { googleContactsConfigured } from "@/lib/network/google";
import { NETWORK_LIMITS } from "@/lib/network/doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) {
    return NextResponse.json({ error: "Sign in to see your network.", authGate: true }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, networkSeenAt: true },
  });
  if (!profile) {
    return NextResponse.json({
      connections: [], incoming: [], outgoing: [], invites: [],
      needsProfile: true,
      googleReady: googleContactsConfigured(),
      limits: NETWORK_LIMITS,
    });
  }

  const data = await loadNetwork(profile.id, profile.networkSeenAt);

  // An import the member started but hasn't finished. Without this the only
  // handle on it is the URL, so navigating away lost a list of 600 contacts
  // that was still sitting there — see docs/runbooks/network-google-oauth.md.
  const pending = await prisma.contactImport.findFirst({
    where: {
      profileId: profile.id,
      // Kept lists (null) plus any legacy row still inside its old TTL.
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, total: true, expiresAt: true, createdAt: true },
  });

  // Stamped AFTER the read, so this response still shows what was new. Failure
  // here must not fail the page — a badge that stays up one visit too long is a
  // far smaller problem than a network page that won't load.
  await prisma.profile
    .update({ where: { id: profile.id }, data: { networkSeenAt: new Date() } })
    .catch(() => {});

  return NextResponse.json({
    ...data,
    needsProfile: false,
    googleReady: googleContactsConfigured(),
    pendingImport: pending
      ? {
          id: pending.id,
          total: pending.total,
          importedAt: pending.createdAt.toISOString(),
          // Null = kept until deleted. The UI says which, because "we keep
          // these" and "these vanish soon" are very different promises.
          expiresAt: pending.expiresAt?.toISOString() ?? null,
        }
      : null,
    limits: NETWORK_LIMITS,
  });
}
