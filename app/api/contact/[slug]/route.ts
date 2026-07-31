/**
 * POST /api/contact/{slug} — a member submits a company's contact form.
 *
 * The one write a stranger can aim at a company, so this route carries the
 * whole anti-spam design:
 *
 * - A REAL account is required (anon cookie refused). Identity-attached
 *   submissions are the load-bearing control: one account per person, and the
 *   company can open the sender's profile before deciding anything.
 * - One open inquiry per company — no follow-ups, no bumps, no re-sends until
 *   the company replies or 30 days pass. Backed by a partial unique index, so
 *   a race can't slip a second one in.
 * - Platform-wide lockout once 3+ DISTINCT companies have marked the sender's
 *   inquiries spam. Reported as a plain rate-limit — the sender is never told
 *   they were marked.
 * - The usual scoreUgc gate on the text itself, links NOT expected: a message
 *   to a company you don't know full of links is exactly the thing.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { userEmail } from "@/lib/company/owner";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import { scoreUgcFields, isSpam, spamMessage } from "@/lib/ugc";
import { sendEmail } from "@/lib/alerts/send";
import {
  validateSubmission,
  renderNewInquiryEmail,
  INQUIRY_FROM,
  SPAM_MARK_LOCKOUT,
  RESUBMIT_COOLDOWN_DAYS,
} from "@/lib/company/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  // IP window first — it's free and it holds even for someone cycling accounts.
  if (!rateLimit(`inquiry-ip:${clientIp(req)}`, 10, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) {
    return NextResponse.json({ error: "Sign in to contact a company." }, { status: 401 });
  }
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, fullName: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Complete your profile first." }, { status: 409 });
  }

  // 3 submissions a day platform-wide. Deliberate: contacting every company
  // in a vertical in one afternoon is the behaviour this feature must not
  // enable, and a real person weighing up who to write to doesn't hit 3.
  if (!rateLimit(`inquiry-d:${profile.id}`, 3, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const company = await prisma.company.findUnique({
    where: { slug: params.slug },
    select: {
      id: true, name: true, slug: true, ownerUserId: true,
      contactEnabled: true, contactReasons: true, contactQuestions: true,
    },
  });
  // Disabled reads as absent on purpose — "this company exists but chose not
  // to hear from you" is more than the sender needs to know.
  if (!company || !company.contactEnabled) {
    return NextResponse.json({ error: "This company isn't accepting messages." }, { status: 404 });
  }
  if (company.ownerUserId === userId) {
    return NextResponse.json({ error: "This is your own company page." }, { status: 400 });
  }

  // The lockout: computed from the rows, so there is no counter to reset or
  // drift. Reported as a rate limit, never as "you were marked spam".
  const spamMarks = await prisma.companyInquiry.findMany({
    where: { profileId: profile.id, status: "SPAM" },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  if (spamMarks.length >= SPAM_MARK_LOCKOUT) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const open = await prisma.companyInquiry.findFirst({
    where: { companyId: company.id, profileId: profile.id, status: "NEW" },
    select: { id: true },
  });
  if (open) {
    return NextResponse.json(
      { error: `You already have a message waiting with ${company.name}. They'll see it — there's nothing to add until they do.` },
      { status: 409 }
    );
  }
  const cutoff = new Date(Date.now() - RESUBMIT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.companyInquiry.findFirst({
    where: { companyId: company.id, profileId: profile.id, repliedAt: null, createdAt: { gte: cutoff } },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json(
      { error: `You contacted ${company.name} recently. If they want to talk, they'll reply — you can write again in a few weeks.` },
      { status: 409 }
    );
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const result = validateSubmission(body, company);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { reason, message, answers } = result.value;

  const verdict = scoreUgcFields([reason, message, ...(answers ?? []).map((a) => a.answer)]);
  if (isSpam(verdict)) return NextResponse.json({ error: spamMessage(verdict) }, { status: 422 });

  let inquiry;
  try {
    inquiry = await prisma.companyInquiry.create({
      data: {
        companyId: company.id,
        profileId: profile.id,
        reason,
        message,
        answers: answers ?? undefined,
      },
      select: { id: true, createdAt: true },
    });
  } catch (err) {
    // The partial unique index caught a race on the open-inquiry rule.
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: `You already have a message waiting with ${company.name}.` },
        { status: 409 }
      );
    }
    throw err;
  }

  // The row is the artifact; the email is a convenience.
  let emailed = false;
  try {
    const to = await userEmail(company.ownerUserId);
    if (to) {
      const { subject, html } = renderNewInquiryEmail({
        companyName: company.name,
        senderName: profile.fullName?.trim() || "A Topezia member",
        reason,
        message,
      });
      await sendEmail({ to, subject, html, from: INQUIRY_FROM });
      emailed = true;
    }
  } catch (err) {
    console.error("[contact] delivery failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ sent: true, id: inquiry.id, emailed });
}
