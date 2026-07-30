/**
 * POST /api/report — someone telling us a public page is wrong.
 *
 * A report is a SIGNAL, never an action. Filing one hides nothing, changes no
 * score and touches no page; it puts the target in the /hq queue for a person
 * to look at. The tempting alternative — auto-hide on N reports — would turn
 * this button into a way to take a stranger's profile down, and on a site about
 * people's careers that is a worse failure than the spam it would catch.
 *
 * Open to signed-out visitors on purpose: the people best placed to notice an
 * impersonated profile are the ones being impersonated, and they have no
 * reason to hold an account here. The cost of that is abuse of the button
 * itself, bounded by the rate limit below and by the fact that a report does
 * nothing on its own.
 *
 * NO IP IS STORED. Rate limiting is in-memory; a durable who-reported-whom log
 * is the sort of data this product has declined to keep elsewhere (résumé
 * files, contact emails on public pages) and it would outlive its usefulness.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["PROFILE", "PORTFOLIO"] as const;
const REASONS = ["SPAM", "IMPERSONATION", "OFFENSIVE", "NOT_THEIR_WORK", "OTHER"] as const;
type Kind = (typeof KINDS)[number];
type Reason = (typeof REASONS)[number];

const NOTE_MAX = 600;

export async function POST(req: NextRequest) {
  if (!rateLimit(`report:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: { kind?: unknown; targetId?: unknown; reason?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : null;
  const reason = REASONS.includes(body.reason as Reason) ? (body.reason as Reason) : null;
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  if (!kind || !reason || !targetId) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // The target must actually exist, or this is a way to fill the queue with
  // rows about nothing. Checked before the write, not after.
  const exists =
    kind === "PROFILE"
      ? await prisma.profile.count({ where: { id: targetId } })
      : await prisma.portfolio.count({ where: { id: targetId } });
  if (!exists) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { userId, authed } = await currentIdentity();

  try {
    await prisma.contentReport.create({
      data: {
        kind,
        targetId,
        reason,
        note: typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) || null : null,
        // Only a REAL account is worth recording. The anonymous cookie would
        // look like an identity in the queue without being one, and it is
        // trivially reset — which would also silently defeat the unique index.
        reporterUserId: authed ? userId : null,
      },
    });
  } catch (e) {
    // Already reported this page from this account. Same answer as success:
    // telling someone their second report was rejected invites them to work
    // out how to file more, and the outcome for them is identical either way.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: true });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
