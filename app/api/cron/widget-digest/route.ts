/**
 * GET /api/cron/widget-digest — Vercel cron, Mondays. Sends the weekly
 * "what visitors asked" digest to every widget owner with a non-quiet week.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` when that env
 * var is set in the project. FAIL CLOSED — no secret configured means no
 * digests, not open digests; the route is harmless (it only emails owners
 * their own numbers) but a public trigger would let anyone drain the
 * theme-model budget and spam owners on demand.
 *
 * Safe to re-run: digestSentAt guards double-sends inside a 6-day window.
 */
import { NextRequest, NextResponse } from "next/server";
import { runWeeklyDigests } from "@/lib/widget/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  // The RESPONSE stays an indistinguishable 404 — a caller must never learn
  // whether the endpoint exists, whether a secret is set, or whether theirs
  // was close. The LOG says which, because this runs once a week and a
  // silent rejection would look exactly like a quiet week: no email, no
  // error, nobody the wiser until someone asks why the digest stopped.
  if (!secret) {
    console.warn("[cron/widget-digest] refused: CRON_SECRET is not set on this deployment");
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (auth !== `Bearer ${secret}`) {
    console.warn(
      `[cron/widget-digest] refused: authorization ${auth ? "did not match CRON_SECRET" : "header absent"}`
    );
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const result = await runWeeklyDigests();
  console.log(`[cron/widget-digest] sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
  return NextResponse.json(result);
}
