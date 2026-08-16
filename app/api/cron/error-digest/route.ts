/**
 * GET /api/cron/error-digest — Vercel cron, Mondays 13:00 UTC (right after
 * the widget digest). Emails the weekly error-log summary — see
 * lib/errors/digest.ts. Same fail-closed CRON_SECRET gate as the other crons.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendErrorDigest } from "@/lib/errors/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret) {
    console.warn("[cron/error-digest] refused: CRON_SECRET is not set on this deployment");
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (auth !== `Bearer ${secret}`) {
    console.warn(`[cron/error-digest] refused: authorization ${auth ? "did not match CRON_SECRET" : "header absent"}`);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const result = await sendErrorDigest();
  console.log(`[cron/error-digest] open=${result.open} new=${result.newThisWeek} sent=${result.sent}`);
  return NextResponse.json(result);
}
