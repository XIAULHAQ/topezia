/**
 * Insight-alert unsubscribe — same contract as the job-alert one:
 *  - POST: RFC 8058 one-click (Gmail/Yahoo post here); plain 200, no redirect.
 *  - GET: a human clicking the email link → flip off, friendly redirect.
 * The token is an unguessable uuid tied to one profile; it only ever flips
 * that profile's insightAlerts off.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const profile = await prisma.profile.findUnique({ where: { insightUnsubToken: token }, select: { id: true } });
  if (!profile) return false;
  await prisma.profile.update({ where: { id: profile.id }, data: { insightAlerts: false } });
  return true;
}

export async function POST(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("token"));
  return new NextResponse(ok ? "unsubscribed" : "not found", { status: ok ? 200 : 404 });
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("token"));
  return NextResponse.redirect(new URL(`/alerts/unsubscribe?state=${ok ? "ok" : "bad"}`, req.url));
}
