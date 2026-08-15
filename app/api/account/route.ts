/**
 * GET/POST/DELETE /api/account — data control for the settings page.
 *
 * The unglamorous, legally-required half: see everything we hold, export it,
 * delete the stored resume text, unsubscribe alerts, or delete the account
 * outright. All scoped to the current identity; alerts match the signed-in
 * user's email (anonymous visitors have no email to match, so no alerts show).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { ANON_COOKIE } from "@/lib/anon-session";
import { purgeProfile } from "@/lib/account/purge";

async function emailOf(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Everything we hold about this user — powers the settings display and the export. */
export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No account." }, { status: 401 });

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      fullName: true, headlineRoleId: true, seniority: true, yearsExperience: true,
      currentLocation: true, country: true, industries: true, resumeText: true,
      employmentTypes: true, remoteTypes: true, locations: true, salaryFloor: true,
      salaryTarget: true, salaryPeriod: true, workAuthorization: true, tier: true, createdAt: true,
      premiumUntil: true, stripeCustomerId: true, connectionEmails: true,
      skills: { select: { proficiency: true, confidence: true, source: true, skill: { select: { name: true } } } },
      // "Export my data" must actually be all of it.
      publications: { select: { type: true, title: true, authors: true, venue: true, year: true, doi: true, isbn: true, url: true, abstract: true } },
    },
  });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const [clicks, saves, dismissals] = await Promise.all([
    prisma.jobClick.count({ where: { profile: { userId } } }),
    prisma.jobSave.count({ where: { profile: { userId } } }),
    prisma.jobDismissal.count({ where: { profile: { userId } } }),
  ]);

  const email = authed ? await emailOf() : null;
  const alerts = email
    ? await prisma.jobAlert.findMany({
        where: { email, unsubscribedAt: null },
        select: { id: true, label: true, confirmedAt: true, frequency: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return NextResponse.json({
    authed,
    email,
    hasResumeText: Boolean(profile.resumeText),
    // The Stripe customer id is plumbing, not user data — the settings card
    // only needs to know whether there IS billing history, so that someone
    // who has lapsed back to FREE can still reach their old invoices.
    profile: { ...profile, resumeText: undefined, stripeCustomerId: undefined },
    membership: {
      tier: profile.tier,
      premiumUntil: profile.premiumUntil,
      hasBilling: Boolean(profile.stripeCustomerId),
    },
    activity: { clicks, saves, dismissals },
    alerts,
  });
}

/** Targeted, reversible-ish actions: clear resume text, or unsubscribe an alert. */
export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No account." }, { status: 401 });

  let body: { action?: string; alertId?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Connection-request emails. Reversible from here in both directions, unlike
  // the emailed unsubscribe link, which only ever turns them off.
  if (body.action === "set-connection-emails") {
    if (typeof body.value !== "boolean") {
      return NextResponse.json({ error: "On or off?" }, { status: 400 });
    }
    await prisma.profile.updateMany({ where: { userId }, data: { connectionEmails: body.value } });
    return NextResponse.json({ ok: true, connectionEmails: body.value });
  }

  if (body.action === "delete-resume-text") {
    await prisma.profile.updateMany({ where: { userId }, data: { resumeText: null, resumeFileUrl: null } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unsubscribe-alert" && body.alertId) {
    // Only the owner's own email may unsubscribe — never trust the id alone.
    const email = authed ? await emailOf() : null;
    if (!email) return NextResponse.json({ error: "Sign in to manage alerts." }, { status: 403 });
    await prisma.jobAlert.updateMany({
      where: { id: body.alertId, email },
      data: { unsubscribedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** Delete the account: the profile, everything tied to it, and the auth user. */
export async function DELETE() {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No account." }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  // Shared with the /hq admin delete so the two can't drift — see
  // lib/account/purge.ts for what cascades and what has to be removed by hand.
  const { authUserDeleted } = await purgeProfile({ profileId: profile.id, userId: authed ? userId : null });

  // End the current session regardless, so they're signed out immediately.
  if (authed) {
    try { await createClient().auth.signOut(); } catch { /* best effort */ }
  }

  const res = NextResponse.json({ ok: true, authUserDeleted });
  res.cookies.set(ANON_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
