/**
 * Unsubscribe endpoint — handles BOTH:
 *  - POST: RFC 8058 one-click (Gmail/Yahoo post here via the
 *    List-Unsubscribe-Post header). Must succeed without any user interaction.
 *  - GET: a human clicking "Unsubscribe" in the email body → unsubscribe, then
 *    redirect to a friendly page.
 *
 * The token is a random uuid, so it's unguessable, and only ever disables the
 * single saved search it belongs to.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const alert = await prisma.jobAlert.findUnique({ where: { unsubToken: token }, select: { id: true } });
  if (!alert) return false;
  await prisma.jobAlert.update({ where: { id: alert.id }, data: { unsubscribedAt: new Date() } });
  return true;
}

export async function POST(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("token"));
  // One-click clients want a plain 200; never make them follow a redirect.
  return new NextResponse(ok ? "unsubscribed" : "not found", { status: ok ? 200 : 404 });
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("token"));
  return NextResponse.redirect(new URL(`/alerts/unsubscribe?state=${ok ? "ok" : "bad"}`, req.url));
}
