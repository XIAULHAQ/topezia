/**
 * POST /api/profile — spec §6.1 (commit the confirmed profile)
 *
 * Takes the edited parse + the three preference answers and writes the Profile
 * (+ embedding). Establishes an anonymous session cookie so /feed and /go can
 * find this profile. Returns the profileId.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createOrUpdateProfile, updateProfileFields, type ProfileFieldEdit } from "@/lib/matching/profile";
import { prisma } from "@/lib/prisma";
import type { ParsedResume } from "@/lib/matching/parse-resume";
import type { ProfilePreferences } from "@/lib/matching/profile";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE } from "@/lib/anon-session";
import { currentIdentity } from "@/lib/identity";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { parsed?: ParsedResume; preferences?: ProfilePreferences; resumeText?: string; photo?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.parsed || !body.preferences) {
    return NextResponse.json({ error: "Missing parsed profile or preferences." }, { status: 400 });
  }
  // Only accept an extracted-photo data URI (never an arbitrary URL from the
  // client), and cap the size so a bad payload can't bloat the row.
  const photoUrl = typeof body.photo === "string" && body.photo.startsWith("data:image/") && body.photo.length < 1_000_000 ? body.photo : null;

  // Signed-in users key their profile to the auth id; anonymous visitors get a
  // one-off id stored in a cookie (upgraded to the account on later sign-in).
  const { userId, authed } = await currentIdentity();
  const uid = userId ?? randomUUID();

  try {
    const { profileId, embedded } = await createOrUpdateProfile({
      userId: uid,
      resumeText: body.resumeText ?? null,
      parsed: body.parsed,
      preferences: body.preferences,
      photoUrl,
    });
    const res = NextResponse.json({ profileId, embedded });
    if (!authed) {
      res.cookies.set(ANON_COOKIE, uid, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ANON_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    return res;
  } catch (err) {
    console.error("profile save failed:", err);
    return NextResponse.json({ error: "Couldn't save your profile — try again." }, { status: 502 });
  }
}


/** GET — the current user's profile, shaped for the edit page (with skill provenance). */
export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });

  const p = await prisma.profile.findUnique({
    where: { userId },
    select: {
      seniority: true, yearsExperience: true, currentLocation: true, country: true,
      industries: true, employmentTypes: true, remoteTypes: true, locations: true,
      salaryFloor: true, salaryTarget: true, salaryPeriod: true, workAuthorization: true,
      tier: true, headlineRoleId: true, fullName: true, photoUrl: true,
      workHistory: true, education: true, certifications: true, entryPath: true,
      skills: { select: { proficiency: true, confidence: true, source: true, skill: { select: { name: true } } } },
    },
  });
  if (!p) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const headline = p.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: p.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;

  // The role taxonomy, grouped by field — so the profile can offer a real
  // PICKER instead of free text that silently fails to resolve. Picking is
  // authoritative: no guessing which field someone is in.
  const verticals = await prisma.vertical.findMany({
    where: { slug: { not: "unsorted" } },
    select: { name: true, roles: { select: { name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  const roleGroups = verticals
    .filter((v) => v.roles.length > 0)
    .map((v) => ({ field: v.name, roles: v.roles.map((r) => r.name) }));

  return NextResponse.json({
    authed,
    roleGroups,
    profile: {
      fullName: p.fullName, headline, seniority: p.seniority, yearsExperience: p.yearsExperience,
      photoUrl: p.photoUrl,
      currentLocation: p.currentLocation, country: p.country, industries: p.industries,
      employmentTypes: p.employmentTypes, remoteTypes: p.remoteTypes, locations: p.locations,
      salaryFloor: p.salaryFloor, salaryTarget: p.salaryTarget, salaryPeriod: p.salaryPeriod,
      workAuthorization: p.workAuthorization, tier: p.tier, entryPath: p.entryPath,
      workHistory: p.workHistory ?? [], education: p.education ?? [], certifications: p.certifications,
      skills: p.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency, confidence: s.confidence, source: s.source })),
    },
  });
}

/** PATCH — save a partial edit to the structured profile (no résumé re-parse). */
export async function PATCH(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile to edit." }, { status: 401 });

  let edit: ProfileFieldEdit;
  try {
    edit = (await req.json()) as ProfileFieldEdit;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await updateProfileFields(userId, edit);
    if (!result) return NextResponse.json({ error: "No profile to edit." }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("profile edit failed:", err);
    return NextResponse.json({ error: "Couldn't save your changes — try again." }, { status: 502 });
  }
}
