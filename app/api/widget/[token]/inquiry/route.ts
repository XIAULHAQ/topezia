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
 *
 * The work itself lives in lib/widget/lead.ts, because a visitor who TYPES
 * their details into the chat instead of filling this in has to end up in
 * exactly the same row, with the same checks and the same email.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import type { ChatTurn } from "@/lib/widget/answer";
import { createWidgetLead } from "@/lib/widget/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  if (!rateLimit(`widget-inq-h:${ip}`, 3, 60 * 60 * 1000) || !rateLimit(`widget-inq-d:${ip}`, 6, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: { id: true, enabled: true, company: { select: { id: true, name: true, ownerUserId: true, plan: true } } },
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "This widget is turned off." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const transcript: ChatTurn[] = (Array.isArray(body.transcript) ? body.transcript : []).flatMap((t) => {
    const turn = t as { role?: unknown; text?: unknown };
    return (turn.role === "visitor" || turn.role === "bot") && typeof turn.text === "string" && turn.text.trim()
      ? [{ role: turn.role, text: turn.text }]
      : [];
  });

  const result = await createWidgetLead(site, {
    email: typeof body.email === "string" ? body.email : "",
    name: typeof body.name === "string" ? body.name : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    message: typeof body.message === "string" ? body.message : "",
    transcript,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // The thread token goes back to the session that CREATED the inquiry (the
  // author reading their own thread), kept in iframe memory only, so a
  // company reply can land in the still-open chat box and not just in email.
  // Known trade-off, accepted: someone who typed an address that isn't
  // theirs sees the reply to the message *they wrote* in that open tab; the
  // email remains the durable channel and the only way back in later.
  return NextResponse.json({ sent: true, id: result.id, emailed: result.emailed, threadToken: result.threadToken });
}
