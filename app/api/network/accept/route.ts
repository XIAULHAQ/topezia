/**
 * GET  /api/network/accept?token= — who is asking, for the /n/[token] page.
 * POST /api/network/accept        — accept it; the edge becomes real.
 *
 * WHY THE EDGE LANDS ACCEPTED, NOT PENDING. Both people have acted: the inviter
 * asked by sending the mail, and this person answered by clicking accept while
 * signed in. Creating it PENDING would leave the invitee waiting on a request
 * they just agreed to.
 *
 * WHY WE DO NOT REQUIRE THE ACCOUNT EMAIL TO MATCH THE INVITED ADDRESS.
 * CompanyInvite does require it, because that token grants access to a
 * company's data and a forwarded email would be a privilege escalation. This
 * token grants a connection and nothing else, and people routinely sign up with
 * a different address from the one a colleague had for them. Refusing those
 * would break the ordinary case to defend against a forwarded invitation
 * producing a connection nobody can see except the two people in it — who can
 * both delete it. The invited address is still recorded on the invite row.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { profileIdFor, requestConnection } from "@/lib/network/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// headlineRoleId is a plain column, not a relation — the name is resolved in a
// second query, the same way every other caller does it.
const INVITER = {
  id: true, fullName: true, photoUrl: true, publicSlug: true,
  currentLocation: true, headlineRoleId: true,
} as const;

async function roleName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const role = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  return role?.name ?? null;
}

async function liveInvite(token: string) {
  if (!token) return null;
  const invite = await prisma.networkInvite.findUnique({
    where: { token },
    select: {
      id: true, email: true, name: true, status: true, expiresAt: true,
      inviter: { select: INVITER },
    },
  });
  if (!invite) return null;
  return invite;
}

export async function GET(req: NextRequest) {
  const invite = await liveInvite(req.nextUrl.searchParams.get("token") ?? "");
  if (!invite) return NextResponse.json({ error: "That invitation link isn't valid." }, { status: 404 });

  const expired = invite.expiresAt.getTime() < Date.now();
  const { userId, authed } = await currentIdentity();
  const profileId = authed && userId ? await profileIdFor(userId) : null;

  return NextResponse.json({
    expired,
    accepted: invite.status === "ACCEPTED",
    // The address is echoed so the person can see which of their addresses was
    // used — it is theirs, and it is already in the mail they clicked from.
    invitedEmail: invite.email,
    invitedName: invite.name,
    inviter: {
      name: invite.inviter.fullName,
      photoUrl: invite.inviter.photoUrl,
      publicSlug: invite.inviter.publicSlug,
      headline: await roleName(invite.inviter.headlineRoleId),
      location: invite.inviter.currentLocation,
    },
    signedIn: Boolean(profileId),
  });
}

export async function POST(req: NextRequest) {
  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";

  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) {
    return NextResponse.json({ error: "Sign in to accept.", authGate: true }, { status: 401 });
  }
  const profileId = await profileIdFor(userId);
  if (!profileId) return NextResponse.json({ error: "Create your profile first." }, { status: 409 });

  const invite = await liveInvite(token);
  if (!invite) return NextResponse.json({ error: "That invitation link isn't valid." }, { status: 404 });
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "That invitation has expired.", expired: true }, { status: 410 });
  }
  if (invite.inviter.id === profileId) {
    return NextResponse.json({ error: "That's your own invitation." }, { status: 400 });
  }

  const made = await requestConnection(invite.inviter.id, profileId, { fromInviteId: invite.id });
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });

  // requestConnection creates it PENDING (the inviter is the requester). This
  // person has now agreed, so flip it — both sides have acted.
  await prisma.connection.updateMany({
    where: { id: made.connectionId, status: "PENDING" },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });

  await prisma.networkInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

  return NextResponse.json({
    connected: true,
    with: invite.inviter.fullName,
    slug: invite.inviter.publicSlug,
  });
}
