/**
 * POST /api/alerts/toggle { slug, place, enabled } — flip the /feed alert
 * switch for a signed-in user.
 *
 * Deliberately NOT the same code path as the public POST /api/alerts: that
 * one emails an address the caller typed, so it double-opt-ins before ever
 * sending anything — the confirmation guards against someone else's inbox.
 * Here the email comes straight from the account's own verified Supabase
 * session, so there's no one else to protect; enabling auto-confirms.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { resolveAlertTarget, alertQueryKey } from "@/lib/alerts/query";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`alerts-toggle:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch { /* fall through to the no-email case below */ }
  if (!email) return NextResponse.json({ error: "No email on this account." }, { status: 401 });

  let body: { slug?: string; place?: string | null; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const target = await resolveAlertTarget(body.slug, body.place ?? null);
  if (!target) return NextResponse.json({ error: "Unknown job search." }, { status: 404 });
  const queryKey = alertQueryKey(target);

  if (body.enabled) {
    await prisma.jobAlert.upsert({
      where: { email_queryKey: { email, queryKey } },
      update: { unsubscribedAt: null, confirmedAt: new Date(), label: target.label },
      create: {
        email,
        queryKey,
        label: target.label,
        roleId: target.roleId,
        verticalId: target.verticalId,
        locationState: target.locationState,
        country: target.country,
        remoteOnly: target.remoteOnly,
        confirmedAt: new Date(),
        confirmToken: randomUUID(),
        unsubToken: randomUUID(),
      },
    });
  } else {
    await prisma.jobAlert.updateMany({
      where: { email, queryKey },
      data: { unsubscribedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, subscribed: !!body.enabled, label: target.label });
}
