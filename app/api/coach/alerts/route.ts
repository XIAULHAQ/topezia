/**
 * POST /api/coach/alerts — toggle insight alerts for the signed-in user.
 * Body: { on: boolean }. The session IS the consent: the email goes to the
 * address they log in with, and every send carries one-click unsubscribe.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

export async function POST(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Expected { on: boolean }." }, { status: 400 });
  }

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  await prisma.profile.update({ where: { id: profile.id }, data: { insightAlerts: body.on } });
  return NextResponse.json({ insightAlerts: body.on });
}
