/**
 * /hq/errors — the error log, password protected. Same gate shape as
 * app/hq/spam/page.tsx: checked server-side, and /api/hq/errors re-checks.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../hq-login";
import ErrorLogClient from "./error-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Error log — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqErrorsPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <ErrorLogClient /> : <HqLogin configured={hqConfigured()} />;
}
