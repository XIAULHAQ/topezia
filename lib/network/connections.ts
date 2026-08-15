/**
 * Reading and writing the member graph.
 *
 * One row per pair, stored in the direction it was asked. Everything awkward
 * about that choice lives in this file so the callers stay simple:
 *
 *  - "Am I connected to X?" is one indexed lookup on the pair in either order.
 *  - A reciprocal request (B asks A while A's request to B is still pending)
 *    is an ACCEPTANCE, not a second row. Two people who both reached for each
 *    other have plainly agreed, and making them wait for a formal click would
 *    be theatre.
 *  - Declining DELETES the row. There is no DECLINED state, on purpose: keeping
 *    one would let the requester see they were refused, and would block the
 *    same pair from ever connecting later after they actually meet.
 */
import { prisma } from "@/lib/prisma";
import { NETWORK_LIMITS } from "@/lib/network/doc";

export type Degree = "self" | "connected" | "sent" | "received" | "none";

/** The Profile.id behind a Supabase user id, or null when they have no profile
 *  yet. Every write in this module takes a Profile.id, never a userId — the
 *  graph is between profiles, and an anonymous session has none. */
export async function profileIdFor(userId: string): Promise<string | null> {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return p?.id ?? null;
}

/** The edge between two profiles in whichever direction it exists. */
export async function edgeBetween(a: string, b: string) {
  return prisma.connection.findFirst({
    where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
    select: { id: true, requesterId: true, addresseeId: true, status: true, createdAt: true },
  });
}

/** How `viewer` stands to `other` — the four words the UI needs to pick a button. */
export async function degreeTo(viewer: string, other: string): Promise<Degree> {
  if (viewer === other) return "self";
  const edge = await edgeBetween(viewer, other);
  if (!edge) return "none";
  if (edge.status === "ACCEPTED") return "connected";
  return edge.requesterId === viewer ? "sent" : "received";
}

/**
 * Degrees for many profiles at once — the import screen asks about hundreds,
 * and asking one at a time would be a query per row.
 */
export async function degreesTo(viewer: string, others: string[]): Promise<Map<string, Degree>> {
  const out = new Map<string, Degree>();
  if (others.length === 0) return out;

  const edges = await prisma.connection.findMany({
    where: {
      OR: [
        { requesterId: viewer, addresseeId: { in: others } },
        { addresseeId: viewer, requesterId: { in: others } },
      ],
    },
    select: { requesterId: true, addresseeId: true, status: true },
  });

  for (const e of edges) {
    const other = e.requesterId === viewer ? e.addresseeId : e.requesterId;
    out.set(other, e.status === "ACCEPTED" ? "connected" : e.requesterId === viewer ? "sent" : "received");
  }
  for (const id of others) {
    if (id === viewer) out.set(id, "self");
    else if (!out.has(id)) out.set(id, "none");
  }
  return out;
}

export type RequestOutcome =
  | { ok: true; result: "requested" | "accepted" | "already" ; connectionId: string }
  | { ok: false; error: string; status: number };

/**
 * Ask to connect.
 *
 * `fromInviteId` links the edge back to the emailed invitation that produced
 * it, so the new member can see who asked rather than finding a stranger in
 * their requests the hour they sign up.
 */
export async function requestConnection(
  fromProfileId: string,
  toProfileId: string,
  opts: { note?: string | null; fromInviteId?: string | null } = {}
): Promise<RequestOutcome> {
  if (fromProfileId === toProfileId) {
    return { ok: false, error: "You can't connect with yourself.", status: 400 };
  }

  const note = (opts.note ?? "").trim().slice(0, NETWORK_LIMITS.NOTE_MAX) || null;
  const existing = await edgeBetween(fromProfileId, toProfileId);

  if (existing) {
    if (existing.status === "ACCEPTED") {
      return { ok: true, result: "already", connectionId: existing.id };
    }
    // They asked us first, and now we are asking them. That is agreement —
    // accept it rather than creating a mirror row nobody could resolve.
    if (existing.addresseeId === fromProfileId) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      return { ok: true, result: "accepted", connectionId: existing.id };
    }
    return { ok: true, result: "already", connectionId: existing.id };
  }

  const pending = await prisma.connection.count({
    where: { requesterId: fromProfileId, status: "PENDING" },
  });
  if (pending >= NETWORK_LIMITS.MAX_PENDING_REQUESTS) {
    return {
      ok: false,
      status: 409,
      error: `You have ${NETWORK_LIMITS.MAX_PENDING_REQUESTS} requests still waiting for an answer. Give those a chance before sending more.`,
    };
  }

  try {
    const row = await prisma.connection.create({
      data: {
        requesterId: fromProfileId,
        addresseeId: toProfileId,
        note,
        fromInviteId: opts.fromInviteId ?? null,
      },
      select: { id: true },
    });
    return { ok: true, result: "requested", connectionId: row.id };
  } catch {
    // Lost a race against another tab (or the same click twice). The unique
    // index did its job; report the state that now exists rather than an error.
    const now = await edgeBetween(fromProfileId, toProfileId);
    if (now) return { ok: true, result: "already", connectionId: now.id };
    return { ok: false, error: "That didn't go through. Try again.", status: 500 };
  }
}

/**
 * Accept a request addressed to me. Scoped by addresseeId in the WHERE, so a
 * guessed id belonging to someone else's request updates nothing.
 */
export async function acceptRequest(profileId: string, connectionId: string): Promise<boolean> {
  const r = await prisma.connection.updateMany({
    where: { id: connectionId, addresseeId: profileId, status: "PENDING" },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });
  return r.count > 0;
}

/**
 * Ignore a request addressed to me, or withdraw one I sent, or disconnect.
 *
 * All three are the same operation — destroy the edge — and all three are
 * scoped to rows the caller is actually part of.
 */
export async function removeEdge(profileId: string, connectionId: string): Promise<boolean> {
  const r = await prisma.connection.deleteMany({
    where: { id: connectionId, OR: [{ requesterId: profileId }, { addresseeId: profileId }] },
  });
  return r.count > 0;
}

const PROFILE_CARD = {
  id: true, publicSlug: true, fullName: true, photoUrl: true,
  currentLocation: true, publicVisible: true, headlineRoleId: true,
} as const;

type ProfileCard = {
  id: string;
  publicSlug: string | null;
  fullName: string | null;
  photoUrl: string | null;
  currentLocation: string | null;
  publicVisible: boolean;
  headlineRoleId: string | null;
};

/**
 * The shape the network screens render.
 *
 * `headlineRoleId` is a plain column rather than a relation, so role names are
 * resolved in ONE batched query for the whole page instead of a lookup per row.
 * `publicSlug` is nulled for a hidden profile — /p/{slug} 404s when
 * publicVisible is false, and linking a name to a 404 is worse than not
 * linking it.
 */
function cardMapper(roleNames: Map<string, string>) {
  return (p: ProfileCard) => ({
    id: p.id,
    fullName: p.fullName,
    photoUrl: p.photoUrl,
    publicSlug: p.publicVisible ? p.publicSlug : null,
    headline: p.headlineRoleId ? roleNames.get(p.headlineRoleId) ?? null : null,
    location: p.currentLocation,
  });
}

/**
 * How many things want this member's attention — the sidebar badge.
 *
 * The two halves are counted differently ON PURPOSE. Pending requests are a
 * to-do list, so they persist until the member accepts or ignores: looking at a
 * decision is not making it. Acceptances are news, so they clear once the
 * member has opened /network. Summing them gives one honest number.
 */
export async function badgeCounts(profileId: string, seenAt: Date | null) {
  const [pending, accepted] = await Promise.all([
    prisma.connection.count({ where: { addresseeId: profileId, status: "PENDING" } }),
    prisma.connection.count({
      where: {
        requesterId: profileId,
        status: "ACCEPTED",
        // A null seenAt would mean "never looked", which after migration 074's
        // backfill can only happen to a profile created before its first visit
        // — treat it as "everything is new", which is true.
        ...(seenAt ? { respondedAt: { gt: seenAt } } : {}),
      },
    }),
  ]);
  return { pending, accepted, total: pending + accepted };
}

/** Everything /network renders in one round trip. */
export async function loadNetwork(profileId: string, seenAt: Date | null = null) {
  const [accepted, incoming, outgoing, invites] = await Promise.all([
    prisma.connection.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: profileId }, { addresseeId: profileId }] },
      select: {
        id: true, respondedAt: true, createdAt: true,
        requester: { select: PROFILE_CARD },
        addressee: { select: PROFILE_CARD },
      },
      orderBy: { respondedAt: "desc" },
      take: 500,
    }),
    prisma.connection.findMany({
      where: { addresseeId: profileId, status: "PENDING" },
      select: { id: true, note: true, createdAt: true, requester: { select: PROFILE_CARD } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.connection.findMany({
      where: { requesterId: profileId, status: "PENDING" },
      select: { id: true, createdAt: true, addressee: { select: PROFILE_CARD } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.networkInvite.findMany({
      where: { inviterId: profileId },
      select: { id: true, email: true, name: true, status: true, sentAt: true, sendError: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  // One query for every role name on the page, rather than one per row.
  const roleIds = [...new Set(
    [
      ...accepted.flatMap((c) => [c.requester.headlineRoleId, c.addressee.headlineRoleId]),
      ...incoming.map((c) => c.requester.headlineRoleId),
      ...outgoing.map((c) => c.addressee.headlineRoleId),
    ].filter((id): id is string => Boolean(id))
  )];
  const roles = roleIds.length
    ? await prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
    : [];
  const card = cardMapper(new Map(roles.map((r) => [r.id, r.name])));

  return {
    connections: accepted.map((c) => {
      const at = c.respondedAt ?? c.createdAt;
      return {
        id: c.id,
        since: at.toISOString(),
        // Flagged "New" only for the person who ASKED — the one who accepted
        // did it deliberately and does not need telling what they just did.
        // This mirrors badgeCounts exactly, so the badge and the page can never
        // disagree about what counts as new.
        isNew: c.requester.id === profileId && (!seenAt || at > seenAt),
        // The other person, whichever side of the edge they are on.
        person: card(c.requester.id === profileId ? c.addressee : c.requester),
      };
    }),
    incoming: incoming.map((c) => ({
      id: c.id, note: c.note, at: c.createdAt.toISOString(), person: card(c.requester),
    })),
    outgoing: outgoing.map((c) => ({
      id: c.id, at: c.createdAt.toISOString(), person: card(c.addressee),
    })),
    invites: invites.map((i) => ({
      id: i.id, email: i.email, name: i.name, status: i.status,
      sent: i.sentAt !== null, sendError: i.sendError, at: i.createdAt.toISOString(),
    })),
  };
}
