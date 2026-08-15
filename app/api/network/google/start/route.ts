/**
 * GET /api/network/google/start — send the member to Google to approve reading
 * their contacts.
 *
 * A redirect rather than a JSON endpoint because the browser has to end up at
 * accounts.google.com either way, and a fetch + client-side location assignment
 * only adds a hop that can fail silently.
 *
 * The `state` is generated here, mirrored into an HttpOnly cookie, and compared
 * on the way back. Without it, anyone could hand a member a crafted callback URL
 * and attach THEIR Google account's contacts to the member's session.
 */
import { NextRequest, NextResponse } from "next/server";
import { currentIdentity } from "@/lib/identity";
import { profileIdFor } from "@/lib/network/connections";
import { authUrl, googleContactsConfigured, newState, STATE_COOKIE } from "@/lib/network/google";
import { NETWORK_RATE } from "@/lib/network/doc";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const back = (err: string) =>
    NextResponse.redirect(new URL(`/network?error=${encodeURIComponent(err)}`, origin));

  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) {
    return NextResponse.redirect(new URL("/login?next=/network", origin));
  }

  const profileId = await profileIdFor(userId);
  if (!profileId) return back("Finish your profile first — that's what your contacts would be connecting to.");

  if (!googleContactsConfigured()) {
    return back("Google contact import isn't switched on for this deployment yet.");
  }

  const [max, windowMs] = NETWORK_RATE.importDay;
  if (!rateLimit(`network-import:${userId}`, max, windowMs)) {
    return back("You've imported your contacts a lot today. Try again tomorrow.");
  }

  const state = newState();
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
