/**
 * GET /auth/callback — where OAuth providers (LinkedIn) land after consent.
 *
 * Exchanges the one-time code for a session, then does the same work the
 * email flow does client-side via /api/auth/link: migrate the visitor's
 * anonymous profile onto the account and route them to where they were going
 * (or to /onboard if the account has no profile yet).
 *
 * The `next` param is clamped to a same-site path — an open redirect on an
 * auth callback is a phishing primitive.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, LAST_UID_COOKIE } from "@/lib/anon-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safePath = (v: string | null): string | null =>
  v && v.startsWith("/") && !v.startsWith("//") ? v : null;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safePath(url.searchParams.get("next"));

  if (!code) {
    // Provider sent an error (user cancelled, misconfiguration). Back to
    // /login with a readable reason rather than a dead end.
    const desc = url.searchParams.get("error_description") ?? "Sign-in was cancelled.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(desc)}`, url.origin));
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed.")}`, url.origin));
  }
  const userId = data.user.id;

  // Same migration as /api/auth/link: the matches and profile built before
  // signing in follow the person into their account.
  const anonUid = req.cookies.get(ANON_COOKIE)?.value ?? null;
  let hasProfile = (await prisma.profile.count({ where: { userId } })) > 0;
  if (anonUid && anonUid !== userId) {
    const anonProfile = await prisma.profile.findUnique({ where: { userId: anonUid }, select: { id: true } });
    if (anonProfile) {
      if (!hasProfile) {
        await prisma.profile.update({ where: { id: anonProfile.id }, data: { userId } });
        hasProfile = true;
      } else {
        await prisma.matchScore.deleteMany({ where: { profileId: anonProfile.id } });
        await prisma.profileSkill.deleteMany({ where: { profileId: anonProfile.id } });
        await prisma.profile.delete({ where: { id: anonProfile.id } });
      }
    }
  }

  // No profile at all → onboarding, which is exactly the "come without a
  // resume" path; otherwise wherever they were headed.
  const dest = hasProfile ? next ?? "/feed" : "/onboard";
  const res = NextResponse.redirect(new URL(dest, url.origin));
  res.cookies.set(ANON_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(LAST_UID_COOKIE, userId, {
    maxAge: ANON_COOKIE_MAX_AGE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
