/**
 * GET    /api/company/testimonials/invite      — outstanding requests.
 * POST   /api/company/testimonials/invite      — ask a client to write one.
 * DELETE /api/company/testimonials/invite?id=  — withdraw a request.
 *
 * Delivery failure does not fail the request, for the same reason as the team
 * invite: the row and its link are the artifact, the email is a convenience.
 * When Resend is unreachable the owner gets the link back and can send it
 * themselves, which beats a 502 that leaves a pending request nobody was told
 * about.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner, userEmail } from "@/lib/company/owner";
import { sendEmail } from "@/lib/alerts/send";
import { str } from "@/lib/company/save";
import { displayNameFor } from "@/lib/company/team";
import {
  checkTestimonialEmail, newTestimonialToken, renderTestimonialInviteEmail,
  testimonialInviteExpiry, testimonialInviteUrl, MAX_PENDING_TESTIMONIAL_INVITES,
} from "@/lib/company/testimonial-invites";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const invites = await prisma.companyTestimonialInvite.findMany({
    where: { companyId: auth.owner.companyId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, clientLabel: true, createdAt: true, expiresAt: true },
  });
  return NextResponse.json({
    invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() < Date.now() })),
    maxPending: MAX_PENDING_TESTIMONIAL_INVITES,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, name: companyName } = auth.owner;

  // Two windows: the hourly stops a burst, the daily stops a patient sender.
  if (!rateLimit(`testimonial-invite-h:${userId}`, 15, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }
  if (!rateLimit(`testimonial-invite-d:${userId}`, 50, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const checked = checkTestimonialEmail(body.email);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { email } = checked;

  const ownEmail = await userEmail(userId);
  if (ownEmail && ownEmail === email) {
    return NextResponse.json(
      { error: "That's your own address. A testimonial you write about yourself is the one you can already add by hand." },
      { status: 400 }
    );
  }

  const pending = await prisma.companyTestimonialInvite.count({ where: { companyId, status: "PENDING" } });
  if (pending >= MAX_PENDING_TESTIMONIAL_INVITES) {
    return NextResponse.json(
      { error: `You have ${MAX_PENDING_TESTIMONIAL_INVITES} requests outstanding. Withdraw some before sending more.` },
      { status: 409 }
    );
  }

  const existing = await prisma.companyTestimonialInvite.findUnique({
    where: { companyId_email: { companyId, email } },
    select: { id: true, status: true },
  });
  if (existing?.status === "PENDING") {
    return NextResponse.json({ error: "You've already asked that address. Withdraw it first to send a new link." }, { status: 409 });
  }
  // An answered request for the same address is replaced — asking the same
  // client again after a second project is a normal thing to want.
  if (existing) await prisma.companyTestimonialInvite.delete({ where: { id: existing.id } });

  const token = newTestimonialToken();
  const invite = await prisma.companyTestimonialInvite.create({
    data: {
      companyId,
      email,
      clientLabel: str(body.clientLabel, 120) || null,
      token,
      expiresAt: testimonialInviteExpiry(new Date()),
    },
    select: { id: true, email: true, clientLabel: true, createdAt: true, expiresAt: true },
  });

  const profile = await prisma.profile.findFirst({ where: { userId }, select: { fullName: true } });
  const inviterName = profile?.fullName?.trim() || (ownEmail ? displayNameFor(null, ownEmail) : null);

  let emailed = false;
  try {
    const { subject, html } = renderTestimonialInviteEmail({ companyName, inviterName, token });
    await sendEmail({ to: email, subject, html });
    emailed = true;
  } catch (err) {
    console.error("[testimonial-invite] delivery failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    invite: { ...invite, expired: false },
    emailed,
    url: testimonialInviteUrl(token),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which request?" }, { status: 400 });

  // Deleting the row destroys the token, which is the only honest way to
  // withdraw a capability.
  const r = await prisma.companyTestimonialInvite.deleteMany({
    where: { id, companyId: auth.owner.companyId, status: "PENDING" },
  });
  if (r.count === 0) return NextResponse.json({ error: "That request is no longer outstanding." }, { status: 404 });

  return NextResponse.json({ revoked: true });
}
