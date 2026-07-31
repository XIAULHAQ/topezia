/**
 * PATCH /api/company/inquiries/{id} — move an inquiry between inbox states
 *                                     (archive, mark spam, restore).
 * POST  /api/company/inquiries/{id} — reply. THE state change of the whole
 *                                     feature: the first reply is what turns
 *                                     a submission into a thread.
 *
 * PATCH can never set REPLIED — that would mint a thread without a message in
 * it. Restoring an inquiry that already has a reply goes back to REPLIED, not
 * NEW; repliedAt is the durable record that a thread exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner, userEmail } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { scoreUgc, isSpam, spamMessage } from "@/lib/ugc";
import { sendEmail } from "@/lib/alerts/send";
import { INQUIRY_LIMITS, renderCompanyReplyEmail } from "@/lib/company/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const requested = body.status;
  if (requested !== "NEW" && requested !== "ARCHIVED" && requested !== "SPAM") {
    return NextResponse.json({ error: "status must be NEW, ARCHIVED or SPAM." }, { status: 400 });
  }

  // The where IS the authorization: someone else's inquiry id reads as absent.
  const inquiry = await prisma.companyInquiry.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, repliedAt: true },
  });
  if (!inquiry) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });

  const status = requested === "NEW" && inquiry.repliedAt ? "REPLIED" : requested;

  try {
    const updated = await prisma.companyInquiry.update({
      where: { id: inquiry.id },
      data: { status },
      select: { id: true, status: true },
    });
    return NextResponse.json({ inquiry: updated });
  } catch (err) {
    // Restoring to NEW can collide with the one-open-inquiry index if the
    // same person has since written again.
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "This person has a newer open message — deal with that one instead." },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, name: companyName } = auth.owner;

  if (!rateLimit(`inquiry-reply:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const text = typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").trim().slice(0, INQUIRY_LIMITS.reply) : "";
  if (!text) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });

  const inquiry = await prisma.companyInquiry.findFirst({
    where: { id: params.id, companyId },
    select: {
      id: true, status: true, repliedAt: true,
      profile: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!inquiry) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });
  if (inquiry.status === "ARCHIVED" || inquiry.status === "SPAM") {
    return NextResponse.json({ error: "Restore this message from the archive before replying." }, { status: 409 });
  }
  if (inquiry._count.messages >= INQUIRY_LIMITS.thread) {
    return NextResponse.json({ error: "This conversation is long enough for email — you both have each other's attention now." }, { status: 409 });
  }

  // linksExpected: a company pointing someone at a careers page or a calendar
  // link is the normal case, not a signal.
  const verdict = scoreUgc(text, { linksExpected: true });
  if (isSpam(verdict)) return NextResponse.json({ error: spamMessage(verdict) }, { status: 422 });

  const [message] = await prisma.$transaction([
    prisma.inquiryMessage.create({
      data: { inquiryId: inquiry.id, sender: "COMPANY", body: text },
      select: { id: true, sender: true, body: true, createdAt: true },
    }),
    prisma.companyInquiry.update({
      where: { id: inquiry.id },
      data: { status: "REPLIED", repliedAt: inquiry.repliedAt ?? new Date() },
    }),
  ]);

  let emailed = false;
  try {
    const to = await userEmail(inquiry.profile.userId);
    if (to) {
      const { subject, html } = renderCompanyReplyEmail({ companyName, body: text });
      await sendEmail({ to, subject, html });
      emailed = true;
    }
  } catch (err) {
    console.error("[company/inquiries] delivery failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ message, emailed });
}
