/**
 * /api/r/[token] — the PUBLIC write path. The only stranger-facing write in
 * the product, so the rules are tight and stated here:
 *
 *  - The token is the entire authorisation. It grants exactly two things:
 *    read the requester's public identity, and submit one response per
 *    signed-in account.
 *  - Nothing about the member leaks beyond what their public profile already
 *    shows (name, headline, photo). No email, no id, no counts.
 *  - Links are STANDING: the invite row stays PENDING and each submission
 *    becomes its own SUBMITTED row pointing back via inviteId. The unique
 *    index on (inviteId, authorUserId) is the lock — two tabs cannot both
 *    land, and one account cannot stack responses on one link.
 *  - The member's delete is the kill switch. Expiry only still bites on
 *    legacy single-use links minted before links became standing.
 *  - Everything written is capped and whitespace-normalised on the way in;
 *    it is rendered as text, never as markup.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { portfolioImageUrl } from "@/lib/portfolio/storage";
import {
  ENDORSEMENT_LIMITS, newToken, clean, cleanText, cleanRating, type RequestContext,
} from "@/lib/endorsements/doc";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

/** Everything the write page may know. Deliberately small. */
async function load(token: string) {
  if (!token || token.length > 64) return null;
  return prisma.endorsement.findUnique({
    where: { token },
    select: {
      id: true, kind: true, status: true, requestNote: true, expiresAt: true,
      profileId: true, portfolioId: true,
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

  // "Already answered" is per-VIEWER now that links are shared: the form
  // closes only for someone whose account already responded. Signed-out
  // viewers always see the form — the sign-in step comes before anything
  // posts, and the POST re-checks regardless.
  let alreadySubmitted = row.status === "SUBMITTED"; // legacy single-use rows
  if (!alreadySubmitted) {
    const { userId, authed } = await currentIdentity();
    if (authed && userId) {
      alreadySubmitted = Boolean(
        await prisma.endorsement.findUnique({
          where: { inviteId_authorUserId: { inviteId: row.id, authorUserId: userId } },
          select: { id: true },
        })
      );
    }
  }

  const ctx: RequestContext = {
    kind: row.kind,
    memberName: row.profile.fullName ?? "A Topezia member",
    memberHeadline: headline,
    memberPhotoUrl: row.profile.photoUrl,
    requestNote: row.requestNote,
    work: row.portfolio
      ? { title: row.portfolio.title, url: `${SITE}/portfolio/${row.portfolio.slug}`, thumb: portfolioImageUrl(row.portfolio.coverPath) }
      : null,
    alreadySubmitted,
    expired: row.status === "PENDING" && row.expiresAt < new Date(),
  };
  return NextResponse.json(ctx);
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const row = await load(params.token);
  if (!row) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  // A SUBMITTED row's token belongs to a legacy single-use link that was
  // answered, or to a response row (whose token nobody was ever handed).
  if (row.status === "SUBMITTED") return NextResponse.json({ error: "This has already been answered — thank you." }, { status: 409 });
  if (row.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired. Ask them for a fresh one." }, { status: 410 });

  // A real account, not an anonymous cookie. This is what lets the profile
  // say the words came from someone who authenticated with an email they
  // control, instead of merely "someone with the link".
  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) {
    return NextResponse.json({ error: "Please sign in so your name means something here." }, { status: 401 });
  }

  // …and it must not be the member reviewing themselves. Without this the
  // sign-in requirement would be theatre: whoever holds the link is usually
  // signed in as the person the link is about.
  const mine = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (mine?.id === row.profileId) {
    return NextResponse.json({ error: "This is your own request — it needs to be written by someone else." }, { status: 403 });
  }

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

  // Soft cap per link, so a link posted somewhere public can't grow a
  // profile without bound. Approximate on purpose — the hard guarantee
  // below is the unique index, not this count.
  const taken = await prisma.endorsement.count({ where: { inviteId: row.id } });
  if (taken >= ENDORSEMENT_LIMITS.maxPerLink) {
    return NextResponse.json({ error: "This link has collected all the responses it can hold." }, { status: 409 });
  }

  // Each response is its own row; the invite stays PENDING and reusable.
  // A double-post (two tabs, a retry) lands on the unique index as P2002
  // rather than as a duplicate on someone's public profile.
  try {
    await prisma.endorsement.create({
      data: {
        profileId: row.profileId,
        kind: row.kind,
        status: "SUBMITTED",
        // Responses need a token (unique NOT NULL) but theirs is never
        // handed out — minted and discarded.
        token: newToken(),
        // Copied from the invite so a review stays attached to its piece
        // even if the member later revokes the link.
        portfolioId: row.portfolioId,
        inviteId: row.id,
        authorUserId: userId,
        authorName,
        authorRole: clean(body.authorRole, ENDORSEMENT_LIMITS.authorRole) || null,
        text,
        rating: cleanRating(body.rating, row.kind),
        submittedAt: new Date(),
        // Meaningless on a response — already in the past by definition.
        expiresAt: new Date(),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "You've already answered this one — thank you." }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
