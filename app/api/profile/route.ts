/**
 * POST /api/profile — spec §6.1 (commit the confirmed profile)
 *
 * Takes the edited parse + the three preference answers and writes the Profile
 * (+ embedding). Establishes an anonymous session cookie so /feed and /go can
 * find this profile. Returns the profileId.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createOrUpdateProfile } from "@/lib/matching/profile";
import type { ParsedResume } from "@/lib/matching/parse-resume";
import type { ProfilePreferences } from "@/lib/matching/profile";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, readAnonUid } from "@/lib/anon-session";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { parsed?: ParsedResume; preferences?: ProfilePreferences; resumeText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.parsed || !body.preferences) {
    return NextResponse.json({ error: "Missing parsed profile or preferences." }, { status: 400 });
  }

  const uid = readAnonUid() ?? randomUUID();

  try {
    const { profileId, embedded } = await createOrUpdateProfile({
      userId: uid,
      resumeText: body.resumeText ?? null,
      parsed: body.parsed,
      preferences: body.preferences,
    });
    const res = NextResponse.json({ profileId, embedded });
    res.cookies.set(ANON_COOKIE, uid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ANON_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("profile save failed:", err);
    return NextResponse.json({ error: "Couldn't save your profile — try again." }, { status: 502 });
  }
}
