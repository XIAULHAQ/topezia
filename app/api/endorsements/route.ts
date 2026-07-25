/**
 * /api/endorsements — the MEMBER's side: create request links, list what came
 * back, hide/show, revoke.
 *
 * The public write side lives at /api/r/[token] and is deliberately a separate
 * route: it is unauthenticated, and mixing it in here would put an anonymous
 * write path one `if` away from an authenticated one.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { ENDORSEMENT_LIMITS, NEVER_EXPIRES, newToken, clean } from "@/lib/endorsements/doc";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

async function me() {
  const { userId } = await currentIdentity();
  if (!userId) return null;
  return prisma.profile.findUnique({ where: { userId }, select: { id: true } });
}

/** GET — everything about this member's requests, for the manage panel. */
export async function GET() {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  const rows = await prisma.endorsement.findMany({
    where: { profileId: profile.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, kind: true, status: true, token: true, sentToLabel: true,
      authorName: true, authorRole: true, text: true, rating: true,
      submittedAt: true, visible: true, expiresAt: true,
      portfolio: { select: { title: true, slug: true } },
      _count: { select: { responses: true } },
    },
  });

  return NextResponse.json({
    endorsements: rows.map((r) => ({
      ...r,
      // The token is the member's to share — it is their link — and a
      // PENDING row IS the standing link, however many responses it has.
      link: r.status === "PENDING" ? `${SITE}/r/${r.token}` : null,
      token: undefined,
      // Legacy single-use rows only; standing links carry NEVER_EXPIRES.
      expired: r.status === "PENDING" && r.expiresAt < new Date(),
      responses: r._count.responses,
      _count: undefined,
    })),
  });
}

/** POST — mint a request link. */
export async function POST(req: NextRequest) {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  let body: { kind?: unknown; sentToLabel?: unknown; requestNote?: unknown; portfolioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind === "REVIEW" ? "REVIEW" : "RECOMMENDATION";

  // A review is about a specific piece of work — that is the entire
  // distinction from a recommendation, so it is required, and it must be a
  // portfolio piece THIS member owns.
  let portfolioId: string | null = null;
  if (kind === "REVIEW") {
    const id = typeof body.portfolioId === "string" ? body.portfolioId : "";
    const owned = id ? await prisma.portfolio.findFirst({ where: { id, profileId: profile.id }, select: { id: true } }) : null;
    if (!owned) return NextResponse.json({ error: "Pick which piece of work this review is about." }, { status: 400 });
    portfolioId = owned.id;
  }

  const pending = await prisma.endorsement.count({ where: { profileId: profile.id, status: "PENDING" } });
  if (pending >= ENDORSEMENT_LIMITS.maxPending) {
    return NextResponse.json(
      { error: `You have ${pending} requests still open. Close or delete some before creating more.` },
      { status: 429 }
    );
  }

  const row = await prisma.endorsement.create({
    data: {
      profileId: profile.id,
      kind,
      portfolioId,
      token: newToken(),
      sentToLabel: clean(body.sentToLabel, ENDORSEMENT_LIMITS.sentToLabel) || null,
      requestNote: clean(body.requestNote, ENDORSEMENT_LIMITS.requestNote) || null,
      // Standing link: it works until the member deletes it. Sign-in +
      // revocation replaced the old 60-day expiry as the abuse control.
      expiresAt: NEVER_EXPIRES,
    },
    select: { id: true, token: true, kind: true, sentToLabel: true, expiresAt: true },
  });

  // We never email anyone — the member sends this link themselves. That keeps
  // us out of the business of mailing strangers on a user's say-so.
  return NextResponse.json({ id: row.id, kind: row.kind, sentToLabel: row.sentToLabel, link: `${SITE}/r/${row.token}`, expiresAt: row.expiresAt });
}

/** PATCH — show/hide a received endorsement. Never edits its words. */
export async function PATCH(req: NextRequest) {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });

  let body: { id?: unknown; visible?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id || typeof body.visible !== "boolean") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  // Scoped update: a wrong id belonging to someone else matches nothing.
  const done = await prisma.endorsement.updateMany({
    where: { id, profileId: profile.id, status: "SUBMITTED" },
    data: { visible: body.visible },
  });
  if (!done.count) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, visible: body.visible });
}

/** DELETE — revoke a pending request, or remove a received one entirely. */
export async function DELETE(req: NextRequest) {
  const profile = await me();
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const done = await prisma.endorsement.deleteMany({ where: { id, profileId: profile.id } });
  if (!done.count) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
