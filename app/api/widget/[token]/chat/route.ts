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
 *   {"t":"done", reply, sources, products, handoff, capped, captured}
 * The done event repeats the full reply so fallback paths (which never
 * stream a delta) and dropped-mid-stream clients still end up whole.
 * Guard failures keep their plain JSON error bodies and status codes.
 *
 * IT ALSO TAKES LEADS. When a visitor types their email into the chat —
 * which is what people actually do when the assistant asks — the lead is
 * created HERE, before the reply is generated, so the assistant can say the
 * team has their details and be telling the truth. See lib/widget/contact.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import { answerFromSite, type ChatTurn } from "@/lib/widget/answer";
import { consumeAiReply } from "@/lib/widget/caps";
import { detectContact, detectContactInChat, leadMessageFromChat } from "@/lib/widget/contact";
import { createWidgetLead } from "@/lib/widget/lead";
import { loadCredentials, lookupOrder, parseOrderQuery } from "@/lib/widget/orders";
import type { OrderContext } from "@/lib/widget/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 30;

type CaptureSite = {
  id: string;
  domain: string;
  company: { id: string; name: string; ownerUserId: string; plan: string };
};
/** What the visitor gave us, and whether the team already had it. */
type Captured = { email: string; name: string | null; threadToken: string | null; already: boolean };

/** The status in plain words, with no model in the loop — used when the
 *  month's AI budget is spent. Facts only, and never a delivery estimate. */
function plainOrderReply(order: import("@/lib/widget/orders").OrderStatus): string {
  const parcel = order.shipments.find((s) => s.trackingNumber || s.trackingUrl);
  const tracking = parcel
    ? ` ${parcel.carrier ? `${parcel.carrier}: ` : "Tracking: "}${parcel.trackingNumber ?? ""}${parcel.trackingUrl ? ` — ${parcel.trackingUrl}` : ""}`
    : "";
  const placed = order.placedAt ? ` placed ${new Date(order.placedAt).toISOString().slice(0, 10)}` : "";
  return `Order ${order.reference}${placed}: ${order.stageLabel}.${tracking}`.trim();
}

/**
 * "Where is my order?"
 *
 * The whole design lives in one place: an order number is not a secret, so a
 * number alone gets nothing — the visitor must also give the email or
 * postcode on the order. See lib/widget/orders/index.ts.
 *
 * The per-IP window is the brute-force guard. Order numbers are sequential;
 * without a ceiling, a script could walk them against one known postcode.
 * Twelve attempts an hour is generous for a customer who mistyped and useless
 * for anyone working through a range.
 */
async function orderContext(
  site: { id: string; domain: string; orderLookup: boolean },
  history: ChatTurn[],
  ip: string
): Promise<OrderContext | null> {
  if (!site.orderLookup) return null;
  const query = parseOrderQuery(history, site.domain);
  if (!query.intent) return null;

  // Asking about an order but hasn't given us both halves yet.
  if (!query.reference || query.verifiers.length === 0) {
    return { state: "need_details", hasReference: Boolean(query.reference) };
  }
  if (!rateLimit(`widget-order:${ip}`, 12, 60 * 60 * 1000)) return { state: "no_match" };

  const cred = await loadCredentials(site.id);
  // Switched on but never connected — say nothing about orders at all rather
  // than inviting details we cannot check.
  if (!cred) return null;

  const result = await lookupOrder(cred, query.reference, query.verifiers);
  if (result.ok) return { state: "found", order: result.order };
  return { state: result.reason === "unavailable" ? "unavailable" : "no_match" };
}

/**
 * The lead nobody filled in a form for.
 *
 * Fires on the turn the address ARRIVES — that is the moment the assistant's
 * reply needs to be true — and leans on the one-open-inquiry rule to stay
 * idempotent when they repeat themselves. If the team already has this
 * person, that is reported too, so the reply doesn't ask a second time.
 *
 * Best effort in the strictest sense: a failure here must never cost the
 * visitor their answer, so everything is caught and the chat carries on.
 */
async function captureFromChat(site: CaptureSite, history: ChatTurn[], ip: string): Promise<Captured | null> {
  try {
    const latest = history.filter((t) => t.role === "visitor").at(-1);
    if (!latest) return null;
    const fresh = detectContact(latest.text, site.domain).email;
    const known = detectContactInChat(history, site.domain);
    if (!known.email) return null;

    // Not a new address this turn — but we know who they are, so say so
    // rather than open a form asking for what they already typed.
    if (!fresh) {
      const open = await prisma.companyInquiry.findFirst({
        where: { siteId: site.id, visitorEmail: known.email, status: "NEW", source: "WIDGET" },
        select: { id: true },
      });
      return open ? { email: known.email, name: known.name, threadToken: null, already: true } : null;
    }

    // A conversation is a slower thing to abuse than a form, so the window is
    // per day only — but it exists, because "type an address, get an email
    // sent to a business" is worth someone's while.
    if (!rateLimit(`widget-chat-lead:${ip}`, 5, 24 * 60 * 60 * 1000)) return null;

    const result = await createWidgetLead(site, {
      email: known.email,
      name: known.name,
      phone: known.phone,
      message: leadMessageFromChat(history, "They shared their contact details in the website chat — the conversation is above."),
      transcript: history,
    });
    if (result.ok) return { email: known.email, name: known.name, threadToken: result.threadToken, already: false };
    // Already waiting on a reply: true, and worth telling the visitor.
    if (result.open) return { email: known.email, name: known.name, threadToken: null, already: true };
    // Refused (disposable address, spam score). Say nothing and claim nothing.
    return null;
  } catch (err) {
    console.error("[widget/chat] lead capture failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  if (!rateLimit(`widget-chat-m:${ip}`, 10, 60 * 1000) || !rateLimit(`widget-chat-h:${ip}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: {
      id: true, enabled: true, domain: true, checkoutPath: true, storeKind: true, orderLookup: true,
      company: { select: { id: true, name: true, ownerUserId: true, plan: true } },
    },
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "This widget is turned off." }, { status: 404 });
  }

  let body: { history?: unknown; page?: unknown; session?: unknown };
  try { body = (await req.json()) as { history?: unknown; page?: unknown; session?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Groups this turn with the rest of its conversation. Minted by the widget
  // per session and never persisted there, so it names a chat, not a person;
  // anything else that arrives is ignored rather than trusted.
  const sessionId =
    typeof body.session === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.session) ? body.session : null;

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
        // ── Did they just hand over their details? ─────────────────────────
        // Before anything else, because the answer is written knowing the
        // outcome: an assistant that says "I've passed that to the team"
        // must be describing something that already happened.
        // Are they chasing an order? First, because it changes what an email
        // in this conversation MEANS.
        const order = await orderContext(site!, history, ip);

        // An address handed over to prove who you are is not a sales lead.
        // Someone chasing a parcel typed their email because we asked them to
        // — turning that into a new enquiry puts an existing customer in the
        // owner's lead inbox and thanks them for getting in touch about
        // nothing. If the lookup FAILED on our side, that's different: we owe
        // them a person, so the lead stands.
        const identityOnly =
          order?.state === "found" || order?.state === "no_match" || order?.state === "need_details";
        const captured = identityOnly ? null : await captureFromChat(site!, history, ip);

        // Budget spent → honest message-taker mode, not a dead bubble. The
        // lead above still went through: the AI is what's capped, never the
        // path from a visitor to the company.
        if (!(await consumeAiReply(site!.id))) {
          // An order status is a fact we already hold — no model involved —
          // so it keeps working when the month's AI budget doesn't. Same
          // principle as the lead flow: what's capped is the writing, never
          // the answer someone actually needs.
          const plain = order?.state === "found" ? plainOrderReply(order.order) : null;
          send({
            t: "done",
            reply: plain
              ? plain
              : captured
                ? "Thanks — your details are with the team and they'll come back to you by email. Our automatic answers are resting this month, so a person will pick this up."
                : "Our automatic answers are resting this month — but a person isn't. Leave your email and your question and the team will reply directly.",
            sources: [], products: [], handoff: !captured && !plain, capped: true,
            captured: captured ?? undefined,
          });
          return;
        }
        const answer = await answerFromSite(
          { id: site!.id, domain: site!.domain, companyName: site!.company.name, checkoutPath: site!.checkoutPath, storeKind: site!.storeKind },
          history,
          {
            pageUrl,
            onDelta: (text) => send({ t: "delta", text }),
            contactCaptured: captured ? { name: captured.name, already: captured.already } : null,
            order,
          }
        );
        // Their details are already with the team — offering the message
        // form on top of that is a dead end, not a handoff.
        send({ t: "done", ...answer, handoff: answer.handoff && !captured, capped: false, captured: captured ?? undefined });
        // Remember BOTH SIDES of the exchange. A lead carries its own full
        // transcript; this is the only record of the conversations that never
        // leave an address — which is most of them — and the reason one of
        // them could only be half-reconstructed. After the send, and a
        // failure here must never break the answer the visitor got.
        const question = history.filter((t) => t.role === "visitor").at(-1)?.text.slice(0, 1000);
        if (question) {
          await prisma.widgetQuestion
            .create({
              data: {
                siteId: site!.id,
                question,
                answer: answer.reply.slice(0, 2000),
                sessionId,
                answered: !answer.handoff,
                pageUrl,
              },
            })
            .catch(() => { /* telemetry, not the product */ });
        }
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
