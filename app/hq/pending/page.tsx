/**
 * /hq/pending — postings waiting on a role, password protected. Same gate
 * shape as app/hq/errors/page.tsx: checked server-side, and /api/hq/pending
 * re-checks it independently.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../hq-login";
import PendingQueue from "./pending-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Waiting on a category — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqPendingPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <PendingQueue /> : <HqLogin configured={hqConfigured()} />;
}
