/**
 * Never invite this address again — from anyone.
 *
 *  - POST: Gmail/Yahoo one-click unsubscribe (RFC 8058, the List-Unsubscribe-Post
 *    header set in lib/network/invites.ts). Must succeed with no interaction.
 *  - GET: a human clicking the link in the mail → suppress, then a page saying so.
 *
 * Same shape as app/api/alerts/unsubscribe, with one deliberate difference: this
 * suppresses the ADDRESS globally, not just the one invitation. Someone who says
 * "don't email me" is saying it to Topezia, not to whichever member happened to
 * have them in their contacts — so the next member who imports the same address
 * book must not be able to mail them either.
 *
 * The token is the only input. We never take an address from a query string:
 * that would let anyone suppress anyone, and would put a real address in a URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suppress } from "@/lib/network/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Two kinds of token arrive here, because both kinds of mail carry the same
 * promise: `token` from a member's connection invitation, `jobInvite` from an
 * employer inviting someone to apply. Either one means the same thing — stop
 * writing to this address — and honouring only one of them would make the
 * footer a lie in whichever mail was left out.
 */
async function optOut(token: string | null, jobInviteToken: string | null): Promise<boolean> {
  if (jobInviteToken) {
    const invite = await prisma.jobInvite.findUnique({
      where: { token: jobInviteToken },
      select: { id: true, email: true },
    });
    // Member invitations carry no address of their own — the member manages
    // their mail in settings, and suppressing their account address here would
    // silently cut off everything else Topezia sends them.
    if (!invite?.email) return false;
    await suppress(invite.email);
    await prisma.jobInvite.deleteMany({ where: { id: invite.id, status: "PENDING" } });
    return true;
  }

  if (!token) return false;
  const invite = await prisma.networkInvite.findUnique({
    where: { token },
    select: { id: true, email: true },
  });
  if (!invite) return false;

  await suppress(invite.email);
  // The pending invitation goes too — leaving a live link to "connect with X"
  // after they asked not to be contacted would be the same request by another
  // route.
  await prisma.networkInvite.deleteMany({ where: { id: invite.id, status: "PENDING" } });
  return true;
}

export async function POST(req: NextRequest) {
  const ok = await optOut(req.nextUrl.searchParams.get("token"), req.nextUrl.searchParams.get("jobInvite"));
  // Mail providers read the status code, not the body.
  return new NextResponse(ok ? "unsubscribed" : "not found", { status: ok ? 200 : 404 });
}

export async function GET(req: NextRequest) {
  const ok = await optOut(req.nextUrl.searchParams.get("token"), req.nextUrl.searchParams.get("jobInvite"));
  return NextResponse.redirect(new URL(`/n/unsubscribed?state=${ok ? "ok" : "bad"}`, req.url));
}
