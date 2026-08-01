/**
 * POST /api/i/{token} — the anonymous visitor replies inside their thread.
 *
 * Token possession is the authorization (it was only ever emailed). Reply is
 * possible only while the thread is open (status REPLIED) — every other
 * state reads identically from this side, same rule as the member API.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import { scoreUgc, isSpam, spamMessage } from "@/lib/ugc";
import { userEmail } from "@/lib/company/owner";
import { sendEmail } from "@/lib/alerts/send";
import { INQUIRY_LIMITS, INQUIRY_FROM, renderCandidateReplyEmail } from "@/lib/company/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — the thread's messages, for the still-open widget to poll so a
 * company reply lands in the chat box the visitor is looking at, not only
 * in their email. Same token-possession authorization as POST; the polling
 * window is generous enough for one open tab and nothing else.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!rateLimit(`ithread-poll:${clientIp(req)}`, 240, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }
  const inquiry = await prisma.companyInquiry.findUnique({
    where: { threadToken: params.token },
    select: {
      status: true,
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, sender: true, body: true, createdAt: true } },
    },
  });
  if (!inquiry) return NextResponse.json({ error: "That conversation no longer exists." }, { status: 404 });
  return NextResponse.json({ open: inquiry.status === "REPLIED", messages: inquiry.messages });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!rateLimit(`ithread:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const text = typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").trim().slice(0, INQUIRY_LIMITS.reply) : "";
  if (!text) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  const inquiry = await prisma.companyInquiry.findUnique({
    where: { threadToken: params.token },
    select: {
      id: true, status: true, visitorName: true, visitorEmail: true,
      company: { select: { name: true, ownerUserId: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!inquiry) return NextResponse.json({ error: "That conversation no longer exists." }, { status: 404 });
  if (inquiry.status !== "REPLIED") {
    return NextResponse.json(
      { error: `You can write here once ${inquiry.company.name} replies.` },
      { status: 409 }
    );
  }
  if (inquiry._count.messages >= INQUIRY_LIMITS.thread) {
    return NextResponse.json({ error: "This conversation is long enough for email now." }, { status: 409 });
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
        senderName: inquiry.visitorName || inquiry.visitorEmail || "A website visitor",
        body: text,
      });
      await sendEmail({ to, subject, html, from: INQUIRY_FROM });
      emailed = true;
    }
  } catch (err) {
    console.error("[i/thread] delivery failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ message, emailed });
}
