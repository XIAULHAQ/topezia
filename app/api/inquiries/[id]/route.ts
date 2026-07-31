/**
 * POST /api/inquiries/{id} — the member replies inside an open thread.
 *
 * Only possible while the inquiry's status is REPLIED — i.e. the company
 * answered and hasn't archived. Everything else refuses with the same
 * sentence, because "closed" and "never answered" and "marked spam" must be
 * indistinguishable from this side (see /api/inquiries).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { userEmail } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { scoreUgc, isSpam, spamMessage } from "@/lib/ugc";
import { sendEmail } from "@/lib/alerts/send";
import { INQUIRY_LIMITS, renderCandidateReplyEmail } from "@/lib/company/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, fullName: true },
  });
  if (!profile) return NextResponse.json({ error: "Complete your profile first." }, { status: 409 });

  if (!rateLimit(`inquiry-msg:${profile.id}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const text = typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").trim().slice(0, INQUIRY_LIMITS.reply) : "";
  if (!text) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  const inquiry = await prisma.companyInquiry.findFirst({
    where: { id: params.id, profileId: profile.id },
    select: {
      id: true, status: true,
      company: { select: { name: true, ownerUserId: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!inquiry) return NextResponse.json({ error: "That conversation no longer exists." }, { status: 404 });
  if (inquiry.status !== "REPLIED") {
    // One sentence for every non-open state — NEW, ARCHIVED and SPAM must
    // read identically from this side.
    return NextResponse.json(
      { error: `You can write here once ${inquiry.company.name} replies.` },
      { status: 409 }
    );
  }
  if (inquiry._count.messages >= INQUIRY_LIMITS.thread) {
    return NextResponse.json({ error: "This conversation is long enough for email — you both have each other's attention now." }, { status: 409 });
  }

  const verdict = scoreUgc(text);
  if (isSpam(verdict)) return NextResponse.json({ error: spamMessage(verdict) }, { status: 422 });

  const message = await prisma.inquiryMessage.create({
    data: { inquiryId: inquiry.id, sender: "CANDIDATE", body: text },
    select: { id: true, sender: true, body: true, createdAt: true },
  });

  let emailed = false;
  try {
    const to = await userEmail(inquiry.company.ownerUserId);
    if (to) {
      const { subject, html } = renderCandidateReplyEmail({
        companyName: inquiry.company.name,
        senderName: profile.fullName?.trim() || "A Topezia member",
        body: text,
      });
      await sendEmail({ to, subject, html });
      emailed = true;
    }
  } catch (err) {
    console.error("[inquiries] delivery failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ message, emailed });
}
