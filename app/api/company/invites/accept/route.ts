/**
 * POST /api/company/invites/accept — join a company's team.
 *
 * Three gates, and the middle one is the one that matters:
 *
 *  1. The token exists, is PENDING and hasn't expired.
 *  2. The SIGNED-IN account's email matches the address the invite went to.
 *     Without this an invite link is bearer-authorization: anyone it is
 *     forwarded to, or who finds it in a shared inbox, could list themselves
 *     as staff at a company they have nothing to do with. Being listed on an
 *     employer's page is a claim about employment, so the address the employer
 *     typed has to be the address that accepts.
 *  3. They aren't already on the team.
 *
 * A failed email lookup refuses the join. Treating "we couldn't check" as
 * "close enough" would turn gate 2 off exactly when the database is unhappy.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { userEmail } from "@/lib/company/owner";
import { displayNameFor } from "@/lib/company/team";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Token guessing is hopeless against 24 bytes of entropy, but an unbounded
  // accept endpoint is still a free database query per request.
  if (!rateLimit(`invite-accept:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) {
    return NextResponse.json({ error: "Sign in to accept this invitation." }, { status: 401 });
  }

  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Missing invitation." }, { status: 400 });

  const invite = await prisma.companyInvite.findUnique({
    where: { token },
    select: {
      id: true, companyId: true, email: true, status: true, expiresAt: true,
      company: { select: { name: true, slug: true } },
    },
  });
  if (!invite || invite.status !== "PENDING") {
    return NextResponse.json({ error: "This invitation has already been used or withdrawn." }, { status: 404 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This invitation has expired — ask for a new one." }, { status: 410 });
  }

  const email = await userEmail(userId);
  if (!email) {
    return NextResponse.json(
      { error: "We couldn't confirm the email address on your account. Try again in a moment." },
      { status: 503 }
    );
  }
  if (email !== invite.email) {
    return NextResponse.json(
      {
        error: `This invitation was sent to ${invite.email}, and you're signed in as ${email}. Sign in with the invited address to accept.`,
      },
      { status: 403 }
    );
  }

  const alreadyOnTeam = await prisma.companyTeamMember.findUnique({
    where: { companyId_userId: { companyId: invite.companyId, userId } },
    select: { id: true },
  });
  if (alreadyOnTeam) {
    await prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedUserId: userId },
    });
    return NextResponse.json({ joined: true, company: invite.company, alreadyMember: true });
  }

  const profile = await prisma.profile.findFirst({ where: { userId }, select: { id: true, fullName: true } });

  await prisma.$transaction([
    prisma.companyTeamMember.create({
      data: {
        companyId: invite.companyId,
        userId,
        profileId: profile?.id ?? null,
        name: displayNameFor(profile?.fullName, email),
        invitedEmail: email,
        role: "MEMBER",
      },
    }),
    prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedUserId: userId },
    }),
  ]);

  revalidatePath(`/company/${invite.company.slug}`);
  return NextResponse.json({ joined: true, company: invite.company });
}
