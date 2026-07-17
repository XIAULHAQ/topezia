/**
 * POST /api/alerts — subscribe an email to a saved search (spec §7 capture).
 *
 * Takes the SEO page's slug (+ optional state) and resolves the filter
 * server-side, so a caller can't fabricate an arbitrary query. Idempotent:
 * re-subscribing the same email to the same search just re-activates it.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { resolveAlertTarget, alertQueryKey } from "@/lib/alerts/query";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  let body: { email?: string; slug?: string; state?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!body.slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const target = await resolveAlertTarget(body.slug, body.state ?? null);
  if (!target) return NextResponse.json({ error: "Unknown job search." }, { status: 404 });

  const queryKey = alertQueryKey(target);
  try {
    await prisma.jobAlert.upsert({
      where: { email_queryKey: { email, queryKey } },
      // Re-subscribing clears a previous unsubscribe.
      update: { unsubscribedAt: null, label: target.label },
      create: {
        email,
        queryKey,
        label: target.label,
        roleId: target.roleId,
        verticalId: target.verticalId,
        locationState: target.locationState,
        remoteOnly: target.remoteOnly,
        unsubToken: randomUUID(),
      },
    });
    return NextResponse.json({ ok: true, label: target.label });
  } catch (err) {
    console.error("alert subscribe failed:", err);
    return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 502 });
  }
}
