/**
 * POST /api/company/inquiries/{id}/draft — write an AI reply draft into the
 * owner's composer.
 *
 * Returns text, changes nothing: no message row, no status change, no email.
 * The owner edits and sends through the normal reply POST, which is where
 * every check (spam scoring, thread cap, closed-state refusal) lives. This
 * is an AI-cost feature — paid tier once employer billing exists; until
 * then the rate limit is the only meter.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { draftReply, type DraftThread } from "@/lib/widget/draft";
import { planFor } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, name: companyName } = auth.owner;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Drafting isn't available right now." }, { status: 503 });
  }
  // A drafted reply is a model call per press — it carries the plan.
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true } });
  if (!planFor(company).aiAssist) {
    return NextResponse.json(
      { error: "Drafting replies is part of Pro.", upgrade: true },
      { status: 402 }
    );
  }
  if (!rateLimit(`inquiry-draft:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const inquiry = await prisma.companyInquiry.findFirst({
    where: { id: params.id, companyId },
    select: {
      status: true, reason: true, message: true, answers: true, transcript: true, brief: true, siteId: true,
      visitorName: true, visitorEmail: true,
      profile: { select: { fullName: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { sender: true, body: true } },
    },
  });
  if (!inquiry) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });
  if (inquiry.status === "ARCHIVED" || inquiry.status === "SPAM") {
    return NextResponse.json({ error: "Restore this message from the archive before replying." }, { status: 409 });
  }

  const thread: DraftThread = {
    senderName:
      inquiry.profile?.fullName?.trim() || inquiry.visitorName?.trim() || inquiry.visitorEmail || "there",
    reason: inquiry.reason,
    message: inquiry.message,
    answers: Array.isArray(inquiry.answers) ? (inquiry.answers as DraftThread["answers"]) : [],
    transcript: Array.isArray(inquiry.transcript) ? (inquiry.transcript as DraftThread["transcript"]) : [],
    messages: inquiry.messages,
    siteId: inquiry.siteId,
    brief: inquiry.brief && typeof inquiry.brief === "object" && !Array.isArray(inquiry.brief)
      ? (inquiry.brief as NonNullable<DraftThread["brief"]>)
      : null,
  };

  try {
    const draft = await draftReply({ id: companyId, name: companyName }, thread);
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[inquiries/draft] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't draft that one — write it by hand or try again." }, { status: 502 });
  }
}
