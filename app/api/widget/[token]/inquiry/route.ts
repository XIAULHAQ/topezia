/**
 * POST /api/widget/{token}/inquiry — the human handoff: a website visitor
 * leaves their email and a message, with the chat transcript riding along.
 *
 * This is the anonymous cousin of /api/contact/{slug}, and the spam posture
 * shifts accordingly: no account to lean on, so it leans on the email
 * (format + disposable blocklist), tight IP windows, scoreUgc, and the same
 * one-open-inquiry rule keyed on the address instead of the profile. The
 * thread token minted here is the visitor's only key to the conversation —
 * it is never returned to the browser, only mailed, so holding the link
 * proves the reply email reached that mailbox.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import { scoreUgcFields, isSpam, spamMessage } from "@/lib/ugc";
import { isDisposableEmail } from "@/lib/email-domains";
import { userEmail } from "@/lib/company/owner";
import { sendEmail } from "@/lib/alerts/send";
import { INQUIRY_LIMITS, INQUIRY_FROM, renderNewInquiryEmail } from "@/lib/company/inquiries";
import type { ChatTurn } from "@/lib/widget/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  if (!rateLimit(`widget-inq-h:${ip}`, 3, 60 * 60 * 1000) || !rateLimit(`widget-inq-d:${ip}`, 6, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: { id: true, enabled: true, company: { select: { id: true, name: true, ownerUserId: true } } },
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "This widget is turned off." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Enter a real email — it's how the reply reaches you." }, { status: 400 });
  }
  if (isDisposableEmail(email)) {
    return NextResponse.json({ error: "Use an address you actually read — the reply goes there." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const message = typeof body.message === "string" ? body.message.replace(/\r\n/g, "\n").trim().slice(0, INQUIRY_LIMITS.message) : "";
  if (message.length < INQUIRY_LIMITS.messageMin) {
    return NextResponse.json({ error: "Say a little more so the team can actually help." }, { status: 400 });
  }
  const transcript: ChatTurn[] = (Array.isArray(body.transcript) ? body.transcript : [])
    .slice(-30)
    .flatMap((t) => {
      const turn = t as { role?: unknown; text?: unknown };
      return (turn.role === "visitor" || turn.role === "bot") && typeof turn.text === "string" && turn.text.trim()
        ? [{ role: turn.role, text: turn.text.trim().slice(0, 1500) }]
        : [];
    });

  const verdict = scoreUgcFields([name, message]);
  if (isSpam(verdict)) return NextResponse.json({ error: spamMessage(verdict) }, { status: 422 });

  const open = await prisma.companyInquiry.findFirst({
    where: { companyId: site.company.id, visitorEmail: email, status: "NEW", source: "WIDGET" },
    select: { id: true },
  });
  if (open) {
    return NextResponse.json(
      { error: "You already have a message waiting with the team — they'll reply to your email." },
      { status: 409 }
    );
  }

  let inquiry;
  try {
    inquiry = await prisma.companyInquiry.create({
      data: {
        companyId: site.company.id,
        source: "WIDGET",
        visitorEmail: email,
        visitorName: name || null,
        threadToken: randomBytes(24).toString("base64url"),
        transcript: transcript.length ? transcript : undefined,
        message,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "You already have a message waiting with the team." }, { status: 409 });
    }
    throw err;
  }

  let emailed = false;
  try {
    const to = await userEmail(site.company.ownerUserId);
    if (to) {
      const { subject, html } = renderNewInquiryEmail({
        companyName: site.company.name,
        senderName: name || email,
        reason: "Website chat",
        message,
      });
      await sendEmail({ to, subject, html, from: INQUIRY_FROM });
      emailed = true;
    }
  } catch (err) {
    console.error("[widget/inquiry] delivery failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ sent: true, id: inquiry.id, emailed });
}
