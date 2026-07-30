/**
 * POST   /api/company/invites      — invite someone to the team by email.
 * DELETE /api/company/invites?id=  — revoke a pending invitation.
 *
 * This is the only place in the product where a user's input makes us send
 * mail to an address they chose, so the limits are deliberately tight and they
 * are documented in lib/company/invites.ts rather than scattered here.
 *
 * Delivery failure does NOT fail the request. The invite row and its link are
 * the real artifact; the email is a convenience. When Resend is unreachable —
 * or RESEND_API_KEY simply isn't set — the owner gets the link back and can
 * send it themselves, which is strictly better than a 502 that leaves a
 * pending invite nobody was told about.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner, userEmail } from "@/lib/company/owner";
import { sendEmail } from "@/lib/alerts/send";
import {
  checkInviteEmail, inviteExpiry, inviteUrl, newInviteToken,
  renderInviteEmail, MAX_PENDING_INVITES,
} from "@/lib/company/invites";
import { displayNameFor } from "@/lib/company/team";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, name: companyName } = auth.owner;

  // Two windows, on purpose. The hourly one stops a burst; the daily one stops
  // a patient sender who spreads it out.
  if (!rateLimit(`company-invite-h:${userId}`, 15, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }
  if (!rateLimit(`company-invite-d:${userId}`, 50, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const checked = checkInviteEmail(body.email);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { email } = checked;

  const ownEmail = await userEmail(userId);
  if (ownEmail && ownEmail === email) {
    return NextResponse.json({ error: "That's your own address — you're already on this team." }, { status: 400 });
  }

  const pending = await prisma.companyInvite.count({ where: { companyId, status: "PENDING" } });
  if (pending >= MAX_PENDING_INVITES) {
    return NextResponse.json(
      { error: `You have ${MAX_PENDING_INVITES} invitations outstanding. Revoke some before sending more.` },
      { status: 409 }
    );
  }

  const already = await prisma.companyTeamMember.findFirst({
    where: { companyId, invitedEmail: email },
    select: { id: true },
  });
  if (already) return NextResponse.json({ error: "They're already on your team." }, { status: 409 });

  const existing = await prisma.companyInvite.findUnique({
    where: { companyId_email: { companyId, email } },
    select: { id: true, status: true },
  });
  if (existing?.status === "PENDING") {
    return NextResponse.json({ error: "You've already invited that address. Revoke it first to send a new link." }, { status: 409 });
  }
  // A previously accepted or revoked row for the same address is replaced —
  // the unique index is on (companyId, email), and re-inviting is a normal
  // thing to want after someone leaves.
  if (existing) await prisma.companyInvite.delete({ where: { id: existing.id } });

  const token = newInviteToken();
  const invite = await prisma.companyInvite.create({
    data: {
      companyId, email, token,
      invitedByUserId: userId,
      expiresAt: inviteExpiry(new Date()),
    },
    select: { id: true, email: true, createdAt: true, expiresAt: true },
  });

  const inviterProfile = await prisma.profile.findFirst({
    where: { userId },
    select: { fullName: true },
  });
  const inviterName = inviterProfile?.fullName?.trim() || (ownEmail ? displayNameFor(null, ownEmail) : null);

  let emailed = false;
  let emailError: string | null = null;
  try {
    const { subject, html } = renderInviteEmail({ companyName, inviterName, token });
    await sendEmail({ to: email, subject, html });
    emailed = true;
  } catch (err) {
    emailError = err instanceof Error ? err.message : "unknown";
    console.error("[company/invites] delivery failed:", emailError);
  }

  return NextResponse.json({
    invite: { ...invite, expired: false },
    emailed,
    // Always returned, so the owner can share the link themselves whether or
    // not delivery worked.
    url: inviteUrl(token),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which invitation?" }, { status: 400 });

  // Revoking DELETES the row rather than flagging it: the token IS the
  // capability, and the only honest way to withdraw one is to destroy it.
  const r = await prisma.companyInvite.deleteMany({
    where: { id, companyId: auth.owner.companyId, status: "PENDING" },
  });
  if (r.count === 0) return NextResponse.json({ error: "That invitation is no longer pending." }, { status: 404 });

  return NextResponse.json({ revoked: true });
}
