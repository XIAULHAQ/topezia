/**
 * GET /auth/callback — where a visitor lands after proving who they are.
 *
 * Two arrival shapes, because two different flows end up here:
 *
 *  1. `?code=…` — OAuth (LinkedIn). PKCE: the code is exchanged against a
 *     verifier @supabase/ssr stored in a cookie, so it only works in the SAME
 *     browser that started the flow. Fine for OAuth, where the whole round
 *     trip happens in one tab.
 *
 *  2. `?token_hash=…&type=signup` — the email confirmation link. This one is
 *     opened from a mail client, very often on a DIFFERENT device from the one
 *     that signed up, so PKCE cannot be relied on. verifyOtp needs nothing but
 *     the token, which is why the confirmation template should use
 *     `{{ .TokenHash }}` rather than the default `{{ .ConfirmationURL }}`.
 *     Both shapes are handled anyway, so neither template setting can leave
 *     someone stranded on a dead link.
 *
 * Whichever way they arrive, the tail is identical: migrate the anonymous
 * profile onto the account and route them onward.
 *
 * The `next` param is clamped to a same-site path — an open redirect on an
 * auth callback is a phishing primitive.
 */
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, LAST_UID_COOKIE } from "@/lib/anon-session";
import { isBusinessDestination, BUSINESS_HOME } from "@/lib/auth/destination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safePath = (v: string | null): string | null =>
  v && v.startsWith("/") && !v.startsWith("//") ? v : null;

/** OTP types that may legitimately land here. Anything else is refused rather
 *  than forwarded to Supabase — `recovery` in particular belongs to /reset,
 *  which sets a new password rather than merely opening a session. */
const OTP_TYPES = new Set<string>(["signup", "email", "email_change", "invite", "magiclink"]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const next = safePath(url.searchParams.get("next"));

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));

  if (!code && !tokenHash) {
    // Provider or Supabase sent an error (cancelled, expired, misconfigured).
    // Its own words beat anything generic we could invent here.
    return fail(url.searchParams.get("error_description") ?? "That sign-in link didn't work. Try again.");
  }

  const supabase = createClient();

  let userId: string;
  if (tokenHash && otpType) {
    if (!OTP_TYPES.has(otpType)) return fail("That link isn't valid here.");
    const { data, error } = await supabase.auth.verifyOtp({
      type: otpType as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error || !data.user) {
      // Confirmation links are single-use and they expire. Say which, or
      // someone clicking an old mail is told nothing they can act on.
      return fail(error?.message ?? "That confirmation link has already been used, or it has expired.");
    }
    userId = data.user.id;
  } else {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
    if (error || !data.user) {
      // Supabase's own PKCE message is written for whoever wrote the app — it
      // talks about code verifiers, storage and SSR frameworks. Say the thing
      // the person can actually act on instead.
      const pkce = /code verifier/i.test(error?.message ?? "");
      return fail(
        pkce
          ? "Finish signing in from the same browser you started in, or just sign in again here."
          : error?.message ?? "Sign-in failed."
      );
    }
    userId = data.user.id;
  }

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

  /**
   * No profile at all → onboarding, which is exactly the "come without a
   * resume" path; otherwise wherever they were headed.
   *
   * UNLESS they came for their company. A business account has no resume and
   * needs none (see lib/auth/destination.ts), and this line is the one that
   * used to demand one: it sent a shop owner confirming their email straight
   * into a CV upload and threw `next` away — and with it the half-finished
   * WordPress connection that brought them here.
   */
  const dest = isBusinessDestination(next)
    ? next ?? BUSINESS_HOME
    : hasProfile
      ? next ?? "/feed"
      : "/onboard";
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
