/**
 * POST /api/widget/{token}/chat — a visitor on the customer's website asks
 * the widget a question.
 *
 * Public and anonymous by nature, so the protections are economic:
 * per-visitor IP windows, and the site's monthly AI budget. When the budget
 * is spent the widget does NOT go dark — it answers as a message-taker
 * instead. The AI is what's capped; the lead flow never is.
 *
 * The happy path STREAMS: newline-delimited JSON events —
 *   {"t":"delta","text":"..."}   reply text, token by token
 *   {"t":"done", reply, sources, products, handoff, capped}
 * The done event repeats the full reply so fallback paths (which never
 * stream a delta) and dropped-mid-stream clients still end up whole.
 * Guard failures keep their plain JSON error bodies and status codes.
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

  let body: { history?: unknown; page?: unknown };
  try { body = (await req.json()) as { history?: unknown; page?: unknown }; }
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

  // The loader reports which page the visitor is on; only that site's own
  // pages count — anything else is noise or mischief.
  let pageUrl: string | null = null;
  if (typeof body.page === "string") {
    try {
      const u = new URL(body.page);
      const h = u.hostname.replace(/^www\./, "");
      if (h === site.domain.replace(/^www\./, "")) pageUrl = `${u.origin}${u.pathname}`;
    } catch { /* not a URL — ignore */ }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        // Budget spent → honest message-taker mode, not a dead bubble.
        if (!(await consumeAiReply(site!.id))) {
          send({
            t: "done",
            reply: "Our automatic answers are resting this month — but a person isn't. Leave your email and your question and the team will reply directly.",
            sources: [], products: [], handoff: true, capped: true,
          });
          return;
        }
        const answer = await answerFromSite(
          { id: site!.id, domain: site!.domain, companyName: site!.company.name },
          history,
          { pageUrl, onDelta: (text) => send({ t: "delta", text }) }
        );
        send({ t: "done", ...answer, capped: false });
      } catch (err) {
        console.error("[widget/chat] stream failed:", err instanceof Error ? err.message : err);
        send({
          t: "done",
          reply: "Something hiccuped on our side. Leave your email and a quick message and the team will get back to you.",
          sources: [], products: [], handoff: true, capped: false,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
