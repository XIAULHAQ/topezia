/**
 * GET/POST/DELETE /api/account — data control for the settings page.
 *
 * The unglamorous, legally-required half: see everything we hold, export it,
 * delete the stored résumé text, unsubscribe alerts, or delete the account
 * outright. All scoped to the current identity; alerts match the signed-in
 * user's email (anonymous visitors have no email to match, so no alerts show).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { ANON_COOKIE } from "@/lib/anon-session";

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
      skills: { select: { proficiency: true, confidence: true, source: true, skill: { select: { name: true } } } },
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
    profile: { ...profile, resumeText: undefined },
    activity: { clicks, saves, dismissals },
    alerts,
  });
}

/** Targeted, reversible-ish actions: clear résumé text, or unsubscribe an alert. */
export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No account." }, { status: 401 });

  let body: { action?: string; alertId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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

/** Delete the account: the profile and everything tied to it. */
export async function DELETE() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No account." }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  // JobClick/JobSave/JobDismissal don't cascade on profile delete (they're
  // signals, kept deliberately), so remove them explicitly first. ProfileSkill
  // and MatchScore do cascade. One transaction so a failure leaves nothing half-deleted.
  await prisma.$transaction([
    prisma.jobClick.deleteMany({ where: { profileId: profile.id } }),
    prisma.jobSave.deleteMany({ where: { profileId: profile.id } }),
    prisma.jobDismissal.deleteMany({ where: { profileId: profile.id } }),
    prisma.profile.delete({ where: { id: profile.id } }),
  ]);

  // Note: for a signed-in user this deletes the profile and all its data, but
  // NOT the Supabase auth account itself — that needs the service-role key,
  // which isn't wired here. The user can still sign in; they'd just have no
  // profile. Flagged in CAVEATS.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ANON_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
