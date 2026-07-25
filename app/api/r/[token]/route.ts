/**
 * /api/r/[token] — the PUBLIC write path. The only unauthenticated write in
 * the product, so the rules are tight and stated here:
 *
 *  - The token is the entire authorisation. It grants exactly two things:
 *    read the requester's public identity, and submit ONCE.
 *  - Nothing about the member leaks beyond what their public profile already
 *    shows (name, headline, photo). No email, no id, no counts.
 *  - Single use: submitting flips the row to SUBMITTED, and the guard is a
 *    conditional write, not a read-then-write — two simultaneous posts cannot
 *    both land.
 *  - Expired links are dead. A permanent secret is a permanent liability.
 *  - Everything written is capped and whitespace-normalised on the way in;
 *    it is rendered as text, never as markup.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portfolioImageUrl } from "@/lib/portfolio/storage";
import {
  ENDORSEMENT_LIMITS, clean, cleanText, cleanRating, type RequestContext,
} from "@/lib/endorsements/doc";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

/** Everything the write page may know. Deliberately small. */
async function load(token: string) {
  if (!token || token.length > 64) return null;
  return prisma.endorsement.findUnique({
    where: { token },
    select: {
      id: true, kind: true, status: true, requestNote: true, expiresAt: true,
      profile: { select: { fullName: true, photoUrl: true, headlineRoleId: true } },
      portfolio: { select: { title: true, slug: true, coverPath: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const row = await load(params.token);
  // A bad token and a deleted request are the same answer — no oracle for
  // probing which tokens ever existed.
  if (!row) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });

  const headline = row.profile.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: row.profile.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;

  const ctx: RequestContext = {
    kind: row.kind,
    memberName: row.profile.fullName ?? "A Topezia member",
    memberHeadline: headline,
    memberPhotoUrl: row.profile.photoUrl,
    requestNote: row.requestNote,
    work: row.portfolio
      ? { title: row.portfolio.title, url: `${SITE}/portfolio/${row.portfolio.slug}`, thumb: portfolioImageUrl(row.portfolio.coverPath) }
      : null,
    alreadySubmitted: row.status === "SUBMITTED",
    expired: row.expiresAt < new Date(),
  };
  return NextResponse.json(ctx);
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const row = await load(params.token);
  if (!row) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (row.status === "SUBMITTED") return NextResponse.json({ error: "This has already been answered — thank you." }, { status: 409 });
  if (row.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired. Ask them for a fresh one." }, { status: 410 });

  let body: { authorName?: unknown; authorRole?: unknown; text?: unknown; rating?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const authorName = clean(body.authorName, ENDORSEMENT_LIMITS.authorName);
  const text = cleanText(body.text, ENDORSEMENT_LIMITS.text);
  if (!authorName) return NextResponse.json({ error: "Please add your name." }, { status: 400 });
  if (text.length < 40) return NextResponse.json({ error: "Please write at least a couple of sentences." }, { status: 400 });

  // Conditional write: `status: "PENDING"` in the where-clause is the lock.
  // A read-then-write here would let two tabs both submit.
  const done = await prisma.endorsement.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: {
      status: "SUBMITTED",
      authorName,
      authorRole: clean(body.authorRole, ENDORSEMENT_LIMITS.authorRole) || null,
      text,
      rating: cleanRating(body.rating, row.kind),
      submittedAt: new Date(),
    },
  });
  if (!done.count) return NextResponse.json({ error: "This has already been answered — thank you." }, { status: 409 });

  return NextResponse.json({ ok: true });
}
