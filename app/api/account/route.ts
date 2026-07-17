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
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Delete the account: the profile, everything tied to it, and the auth user. */
export async function DELETE() {
  const { userId, authed } = await currentIdentity();
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

  // For a signed-in user, remove the Supabase auth user too — a "delete my
  // account" that leaves you able to sign back in isn't a real deletion. Needs
  // the service-role key (server-only). If it isn't configured, the profile
  // data is still gone; we just couldn't remove the login. authUserDeleted
  // reports which happened.
  let authUserDeleted = false;
  if (authed) {
    const admin = createAdminClient();
    if (admin) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.error("auth user delete failed:", error.message);
      else authUserDeleted = true;
    } else {
      console.warn("account deleted but SUPABASE_SERVICE_ROLE_KEY not set — auth user survives");
    }
    // End the current session regardless, so they're signed out immediately.
    try { await createClient().auth.signOut(); } catch { /* best effort */ }
  }

  const res = NextResponse.json({ ok: true, authUserDeleted });
  res.cookies.set(ANON_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
