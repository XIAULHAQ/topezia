/**
 * POST /api/widget/{token}/chat — a visitor on the customer's website asks
 * the widget a question.
 *
 * Public and anonymous by nature, so the protections are economic:
 * per-visitor IP windows, and the site's monthly AI budget. When the budget
 * is spent the widget does NOT go dark — it answers as a message-taker
 * instead. The AI is what's capped; the lead flow never is.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import { answerFromSite, type ChatTurn } from "@/lib/widget/answer";
import { consumeAiReply } from "@/lib/widget/caps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 30;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  if (!rateLimit(`widget-chat-m:${ip}`, 10, 60 * 1000) || !rateLimit(`widget-chat-h:${ip}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: { id: true, enabled: true, domain: true, company: { select: { name: true } } },
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "This widget is turned off." }, { status: 404 });
  }

  let body: { history?: unknown };
  try { body = (await req.json()) as { history?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const history: ChatTurn[] = (Array.isArray(body.history) ? body.history : [])
    .slice(-MAX_TURNS)
    .flatMap((t) => {
      const turn = t as { role?: unknown; text?: unknown };
      return (turn.role === "visitor" || turn.role === "bot") && typeof turn.text === "string" && turn.text.trim()
        ? [{ role: turn.role, text: turn.text.trim().slice(0, 1500) }]
        : [];
    });
  if (!history.some((t) => t.role === "visitor")) {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }

  // Budget spent → honest message-taker mode, not a dead bubble.
  if (!(await consumeAiReply(site.id))) {
    return NextResponse.json({
      reply: "Our automatic answers are resting this month — but a person isn't. Leave your email and your question and the team will reply directly.",
      sources: [],
      handoff: true,
      capped: true,
    });
  }

  const answer = await answerFromSite(
    { id: site.id, domain: site.domain, companyName: site.company.name },
    history
  );
  return NextResponse.json({ ...answer, capped: false });
}
