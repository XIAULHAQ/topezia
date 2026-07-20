/**
 * POST /api/auth/link — called right after sign-in/sign-up.
 *
 * Migrates the visitor's anonymous profile (keyed by the anon cookie) to their
 * now-authenticated user id, so the matches they built before signing up follow
 * them into their account. Clears the anon cookie afterward. Returns whether
 * the account has a profile (so the client can route to /feed vs /onboard).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, LAST_UID_COOKIE } from "@/lib/anon-session";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const anonUid = cookies().get(ANON_COOKIE)?.value ?? null;
  let hasProfile = (await prisma.profile.count({ where: { userId: user.id } })) > 0;

  if (anonUid && anonUid !== user.id) {
    const anonProfile = await prisma.profile.findUnique({ where: { userId: anonUid }, select: { id: true } });
    if (anonProfile) {
      if (!hasProfile) {
        // Move the anon profile onto the account.
        await prisma.profile.update({ where: { id: anonProfile.id }, data: { userId: user.id } });
        hasProfile = true;
      } else {
        // Account already has a profile — discard the anon one (MVP: keep the
        // account's; a smarter merge is a later refinement).
        await prisma.matchScore.deleteMany({ where: { profileId: anonProfile.id } });
        await prisma.profileSkill.deleteMany({ where: { profileId: anonProfile.id } });
        await prisma.profile.delete({ where: { id: anonProfile.id } });
      }
    }
  }

  const res = NextResponse.json({ ok: true, hasProfile });
  res.cookies.set(ANON_COOKIE, "", { maxAge: 0, path: "/" }); // done with the anon session
  // Remember WHO signed in on this device, so /login can greet them by name
  // after they log out (the anon cookie we just cleared can't do that).
  res.cookies.set(LAST_UID_COOKIE, user.id, {
    maxAge: ANON_COOKIE_MAX_AGE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
