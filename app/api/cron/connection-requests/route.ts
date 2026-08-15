/**
 * GET /api/cron/connection-requests — Vercel cron, every four hours. Emails
 * members the connection digest: requests waiting on them, and requests of
 * theirs that were accepted.
 *
 * The path still says "requests" because it is wired into vercel.json and
 * renaming it would mean a window where the cron config points at a route that
 * no longer exists. The route covers both halves — see lib/network/notify.ts.
 *
 * Auth: same fail-closed pattern as /api/cron/widget-digest. No CRON_SECRET
 * configured means no sends, not open sends — a public trigger here would let
 * anyone drain the Resend quota and, worse, force-send mail to members on
 * demand. The RESPONSE is an indistinguishable 404 either way; the LOG says
 * which, because a silent rejection looks exactly like a quiet window.
 *
 * Safe to re-run: notifiedAt guards double-sends, and the per-member quiet
 * window guards the rest. Running it twice in a minute sends nothing twice.
 */
import { NextRequest, NextResponse } from "next/server";
import { runConnectionNotifications } from "@/lib/network/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 200 recipients per run (MAX_RECIPIENTS_PER_RUN), each a few queries and one
// sequential Resend call — 100-200s on a full batch. The old 120 was sized to
// the Hobby ceiling and would have cut most full batches short. Timing out is
// recoverable by design (unprocessed recipients stay unmarked and the next tick
// picks them up), but a backlog would then need several ticks to drain and
// every run would waste the work it did not finish.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret) {
    console.warn("[cron/connection-requests] refused: CRON_SECRET is not set on this deployment");
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (auth !== `Bearer ${secret}`) {
    console.warn(
      `[cron/connection-requests] refused: authorization ${auth ? "did not match CRON_SECRET" : "header absent"}`
    );
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const result = await runConnectionNotifications();
  console.log("[cron/connection-requests]", JSON.stringify(result));
  return NextResponse.json(result);
}
