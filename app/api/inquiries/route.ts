/**
 * GET /api/inquiries — the messages the signed-in member has sent to
 * companies, with their threads.
 *
 * The status enum NEVER crosses this boundary. The sender sees exactly three
 * truths, derived server-side:
 *
 *   replied  — did the company ever answer (repliedAt survives archiving)
 *   open     — can they write a message right now (status is REPLIED)
 *
 * NEW, ARCHIVED and SPAM all read as "sent, no reply" — no read receipts, no
 * "seen 3 days ago", and above all no way to distinguish "they marked you
 * spam" from "they haven't looked yet". Telling people they were marked spam
 * turns a quiet judgement into a confrontation, and companies would stop
 * using the mark.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Complete your profile first." }, { status: 409 });

  const rows = await prisma.companyInquiry.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, reason: true, message: true, answers: true,
      status: true, repliedAt: true, createdAt: true,
      company: { select: { name: true, slug: true, logoPath: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, sender: true, body: true, createdAt: true },
      },
    },
  });

  const inquiries = rows.map(({ status, ...r }) => ({
    ...r,
    replied: r.repliedAt !== null,
    open: status === "REPLIED",
  }));

  return NextResponse.json({ inquiries });
}
