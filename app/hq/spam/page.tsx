/**
 * /hq/spam — the review queue, password protected.
 *
 * Same gate shape as app/hq/page.tsx: the check runs server-side, so an
 * unauthenticated request never receives the queue markup, and the data
 * endpoint (/api/hq/spam) re-checks the same session independently.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../hq-login";
import SpamQueue from "./spam-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Review queue — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqSpamPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <SpamQueue /> : <HqLogin configured={hqConfigured()} />;
}
