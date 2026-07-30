/**
 * /hq/waitlist — founding-employer signups, password protected.
 *
 * Its own route rather than a tab on /hq: it now has a URL you can link or
 * bookmark, and /hq stops fetching waitlist data on every visit just to fill a
 * tab nobody clicked. Same gate shape as every other HQ page — the check runs
 * server-side, and /api/hq/waitlist-stats re-checks the session independently.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../hq-login";
import WaitlistView from "./waitlist-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Employer waitlist — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqWaitlistPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <WaitlistView /> : <HqLogin configured={hqConfigured()} />;
}
