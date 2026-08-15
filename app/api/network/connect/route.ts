/**
 * POST   /api/network/connect      — ask one person, or a batch, to connect.
 * PATCH  /api/network/connect      — accept a request addressed to me.
 * DELETE /api/network/connect?id=  — ignore, withdraw, or disconnect.
 *
 * DELETE covers all three because they are one operation: destroy the edge.
 * There is no DECLINED state to write — keeping one would tell the requester
 * they were refused, and would stop the same two people connecting later when
 * they actually do meet.
 */
import { NextRequest, NextResponse } from "next/server";
import { currentIdentity } from "@/lib/identity";
import {
  acceptRequest, profileIdFor, removeEdge, requestConnection,
} from "@/lib/network/connections";
import { NETWORK_LIMITS, NETWORK_RATE } from "@/lib/network/doc";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me() {
  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) {
    return { ok: false as const, response: NextResponse.json({ error: "Sign in first.", authGate: true }, { status: 401 }) };
  }
  const profileId = await profileIdFor(userId);
  if (!profileId) {
    return { ok: false as const, response: NextResponse.json({ error: "Create your profile first." }, { status: 409 }) };
  }
  return { ok: true as const, userId, profileId };
}

export async function POST(req: NextRequest) {
  const auth = await me();
  if (!auth.ok) return auth.response;

  const [max, windowMs] = NETWORK_RATE.requestHour;
  if (!rateLimit(`network-request:${auth.userId}`, max, windowMs)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // One shape for one person and for a batch, so the import screen and a
  // profile page's "Connect" button hit the same code path.
  const ids = Array.isArray(body.profileIds)
    ? body.profileIds
    : typeof body.profileId === "string"
      ? [body.profileId]
      : [];

  const clean = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (clean.length === 0) return NextResponse.json({ error: "Nobody to connect with." }, { status: 400 });
  if (clean.length > NETWORK_LIMITS.REQUESTS_PER_BATCH) {
    return NextResponse.json(
      { error: `That's more than ${NETWORK_LIMITS.REQUESTS_PER_BATCH} people at once. Send them in smaller groups.` },
      { status: 400 }
    );
  }

  const note = typeof body.note === "string" ? body.note : null;

  // Sequential, not Promise.all: the reciprocal-request check in
  // requestConnection reads the edge it may be about to write, and two of those
  // racing for the same pair would both miss.
  const results: { profileId: string; result: string }[] = [];
  const failures: { profileId: string; error: string }[] = [];
  for (const id of clean) {
    const r = await requestConnection(auth.profileId, id, { note });
    if (r.ok) results.push({ profileId: id, result: r.result });
    else failures.push({ profileId: id, error: r.error });
  }

  return NextResponse.json({
    requested: results.filter((r) => r.result === "requested").length,
    accepted: results.filter((r) => r.result === "accepted").length,
    already: results.filter((r) => r.result === "already").length,
    results,
    failures,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await me();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which request?" }, { status: 400 });

  const done = await acceptRequest(auth.profileId, id);
  if (!done) return NextResponse.json({ error: "That request is no longer waiting." }, { status: 404 });
  return NextResponse.json({ accepted: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await me();
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which connection?" }, { status: 400 });

  const done = await removeEdge(auth.profileId, id);
  if (!done) return NextResponse.json({ error: "That connection is already gone." }, { status: 404 });
  return NextResponse.json({ removed: true });
}
