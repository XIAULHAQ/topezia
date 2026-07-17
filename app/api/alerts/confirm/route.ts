/**
 * GET /api/alerts/confirm?token=… — double opt-in confirmation link.
 * Marks the saved search confirmed, then redirects to a friendly page.
 * Nothing is ever sent to an address that hasn't been through here.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const done = (state: string) => NextResponse.redirect(new URL(`/alerts/confirmed?state=${state}`, req.url));
  if (!token) return done("bad");

  const alert = await prisma.jobAlert.findUnique({ where: { confirmToken: token }, select: { id: true, confirmedAt: true } });
  if (!alert) return done("bad");

  if (!alert.confirmedAt) {
    await prisma.jobAlert.update({
      where: { id: alert.id },
      data: { confirmedAt: new Date(), unsubscribedAt: null },
    });
  }
  return done("ok");
}
