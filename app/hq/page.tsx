/**
 * /hq — internal dashboard, password protected.
 *
 * The gate runs HERE, on the server: an unauthenticated request is served the
 * login form and never the dashboard markup, so no member data reaches the
 * browser before the password is accepted. (The data endpoints check the same
 * session independently, so neither layer is load-bearing on its own.)
 *
 * Deliberately not named /admin, and deliberately NOT listed in robots.txt —
 * naming a private path in a public file just advertises it. Indexing is
 * refused via the noindex metadata below instead.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "./hq-login";
import HqDashboard from "./hq-dashboard";

export const dynamic = "force-dynamic"; // never cache a page that renders personal data
export const runtime = "nodejs"; // node:crypto for the session check

export const metadata: Metadata = {
  title: "Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <HqDashboard /> : <HqLogin configured={hqConfigured()} />;
}
