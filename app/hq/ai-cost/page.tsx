/**
 * /hq/ai-cost — where the Anthropic bill goes, by feature, day and site.
 * Same gate shape as app/hq/errors/page.tsx.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../hq-login";
import AiCostClient from "./ai-cost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "AI cost — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqAiCostPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <AiCostClient /> : <HqLogin configured={hqConfigured()} />;
}
