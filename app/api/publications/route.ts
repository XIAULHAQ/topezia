/**
 * /api/publications — the member's own publications, full CRUD.
 *
 * Owner-scoped throughout: every write's where-clause carries profileId, so
 * a guessed id belonging to someone else matches nothing. Public rendering
 * happens in app/p/profile-data.ts, not here.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { PUBLICATION_LIMITS, sanitizePublication } from "@/lib/publications/doc";
import { scoreUgcFields, isSpam, spamMessage } from "@/lib/ugc";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";
import { PUBLICATION_BUCKET, publicationImageUrl } from "@/lib/publications/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's profile, or null.
 *
 * `authed` — a real signed-in account, not just the anonymous onboarding
 * cookie — is required for every method here, matching /api/portfolio,
 * /api/company, /api/applications and /api/postings. A publication renders a
 * member-supplied `url` on the public profile, so letting an anonymous cookie
 * write one made this the cheapest way onto a public page on our domain.
 */
async function me(write: boolean) {
  const { userId, authed } = await currentIdentity();
  if (!userId || (write && !authed)) return null;
  return prisma.profile.findUnique({ where: { userId }, select: { id: true } });
}

const SELECT = {
  id: true, type: true, title: true, authors: true, venue: true, year: true,
  doi: true, isbn: true, url: true, abstract: true, position: true, imagePath: true,
} as const;

/** Rows as the client wants them: the stored path resolved to a URL, because
 *  the bucket name is a server concern and the panel only ever renders src. */
type Row = Prisma.PublicationGetPayload<{ select: typeof SELECT }>;
const withImage = (r: Row) => ({ ...r, imageUrl: publicationImageUrl(r.imagePath) });

/** Everything a visitor reads on the public profile, scored as one document.
 *  A citation legitimately carries a link, so links count at half weight and a
 *  refusal needs several signals to agree — see lib/ugc.ts. */
function spamCheck(p: NonNullable<ReturnType<typeof sanitizePublication>>): string | null {
  const v = scoreUgcFields([p.title, p.venue, p.abstract, p.url, ...(p.authors ?? [])], { linksExpected: true });
  return isSpam(v) ? spamMessage(v) : null;
}

export async function GET() {
  const profile = await me(false);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const publications = await prisma.publication.findMany({
    where: { profileId: profile.id },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: SELECT,
  });
  return NextResponse.json({ publications: publications.map(withImage) });
}

export async function POST(req: NextRequest) {
  const profile = await me(true);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  // Well above any honest use — perProfile caps the total at 25, so this exists
  // only to stop a script cycling create/delete to hammer the write path.
  if (!rateLimit(`pub-write:${profile.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const p = sanitizePublication(body);
  if (!p) return NextResponse.json({ error: "A publication needs at least a title." }, { status: 400 });
  const bad = spamCheck(p);
  if (bad) return NextResponse.json({ error: bad }, { status: 422 });

  const count = await prisma.publication.count({ where: { profileId: profile.id } });
  if (count >= PUBLICATION_LIMITS.perProfile) {
    return NextResponse.json({ error: `Up to ${PUBLICATION_LIMITS.perProfile} publications per profile.` }, { status: 429 });
  }

  const row = await prisma.publication.create({
    data: { profileId: profile.id, ...p, position: count },
    select: SELECT,
  });
  return NextResponse.json({ publication: row && withImage(row) });
}

export async function PATCH(req: NextRequest) {
  const profile = await me(true);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const p = sanitizePublication(body);
  if (!id || !p) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const bad = spamCheck(p);
  if (bad) return NextResponse.json({ error: bad }, { status: 422 });

  const done = await prisma.publication.updateMany({
    where: { id, profileId: profile.id },
    data: p,
  });
  if (!done.count) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = await prisma.publication.findUnique({ where: { id }, select: SELECT });
  return NextResponse.json({ publication: row && withImage(row) });
}

export async function DELETE(req: NextRequest) {
  const profile = await me(true);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  // Read the image path BEFORE the row goes, or the object is unreachable —
  // nothing else records it, so a delete-then-look-up loses the bytes forever.
  const doomed = await prisma.publication.findFirst({
    where: { id, profileId: profile.id },
    select: { imagePath: true },
  });

  const done = await prisma.publication.deleteMany({ where: { id, profileId: profile.id } });
  if (!done.count) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Row first, bytes after: the member has already seen the entry disappear,
  // and a failed cleanup leaves an orphan rather than a broken page.
  if (doomed?.imagePath) {
    const admin = createAdminClient();
    await admin?.storage.from(PUBLICATION_BUCKET).remove([doomed.imagePath]).catch(() => {
      /* best effort */
    });
  }
  return NextResponse.json({ ok: true });
}
