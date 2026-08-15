/**
 * Turn off connection-request emails.
 *
 *  - POST: Gmail/Yahoo one-click unsubscribe (RFC 8058). Must succeed with no
 *    interaction.
 *  - GET: a human clicking the link → flip the setting, then a page saying so.
 *
 * SCOPE, AND WHY IT IS NARROW. This is the opposite of
 * /api/network/unsubscribe, which suppresses an address globally and forever.
 * That one is for a stranger who never asked to hear from us. This one is a
 * MEMBER adjusting one of their own settings — so it flips exactly one boolean
 * and leaves job alerts, insight alerts and everything else alone. Reusing the
 * global suppression list here would be a member accidentally banning their own
 * address from invitations they may later want.
 *
 * The token is the only input, and it is a per-member secret, so acting on it
 * proves the member received the mail. No address ever appears in the URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function optOut(token: string | null): Promise<boolean> {
  if (!token) return false;
  // updateMany rather than update: a token that matches nothing is a 404, not
  // an exception.
  const r = await prisma.profile.updateMany({
    where: { notifyUnsubToken: token },
    data: { connectionEmails: false },
  });
  return r.count > 0;
}

export async function POST(req: NextRequest) {
  const ok = await optOut(req.nextUrl.searchParams.get("token"));
  return new NextResponse(ok ? "unsubscribed" : "not found", { status: ok ? 200 : 404 });
}

export async function GET(req: NextRequest) {
  const ok = await optOut(req.nextUrl.searchParams.get("token"));
  return NextResponse.redirect(new URL(`/n/notifications-off?state=${ok ? "ok" : "bad"}`, req.url));
}
