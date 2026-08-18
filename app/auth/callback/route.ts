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
import { adoptMatchScores } from "@/lib/matching/match-version";
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
  /**
   * Where they were going, as recorded ON THE ACCOUNT at signup.
   *
   * `next` is supposed to arrive in the URL: signUp is called with an
   * emailRedirectTo that carries it, and Supabase is handed that as the
   * redirect. But the confirmation email is rendered from a template in the
   * Supabase dashboard, and OURS only prints the token — it never prints the
   * redirect. So the delivered link is
   *   /auth/callback?token_hash=…&type=signup
   * with the destination silently dropped, and someone who created an account
   * halfway through connecting their WordPress site was sent to résumé
   * onboarding instead of back to the approval screen. Found by reading the
   * actual delivered mail in Resend, not the code.
   *
   * The template is worth fixing, but this must not DEPEND on a dashboard
   * setting nobody can see from the repo — that is the same class of failure
   * that once pointed password-reset links at localhost. So the destination
   * also rides on the user record, where no template can drop it, and it
   * survives the very common case of confirming on a different device from
   * the one that signed up.
   *
   * user_metadata is writable by its own user, so it is clamped by safePath
   * exactly like the query param. The worst it can do is redirect someone to
   * a page of their own choosing, inside our own site.
   */
  let signupNext: string | null = null;
  const rememberedNext = (user: { user_metadata?: Record<string, unknown> | null } | null) => {
    const raw = user?.user_metadata?.signup_next;
    return typeof raw === "string" ? safePath(raw) : null;
  };

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
    signupNext = rememberedNext(data.user);
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
    signupNext = rememberedNext(data.user);
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
        // The scores were paid for; carry them over. They only serve if the
        // surviving profile hashes the same (match-version.ts).
        const mine = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
        if (mine) await adoptMatchScores(anonProfile.id, mine.id);
        else await prisma.matchScore.deleteMany({ where: { profileId: anonProfile.id } });
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
  // The URL first, because a link that carries a destination is stating the
  // most recent intent; the account's memory is the fallback for when the
  // email template dropped it.
  const target = next ?? signupNext;
  const dest = isBusinessDestination(target)
    ? target ?? BUSINESS_HOME
    : hasProfile
      ? target ?? "/feed"
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
