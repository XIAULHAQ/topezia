/**
 * POST /api/errors — client-side crash reports into the error log.
 *
 * Sent by app/_components/ErrorReporter.tsx (window "error" /
 * "unhandledrejection") and app/error.tsx (React render errors). Anonymous
 * and unauthenticated on purpose: a crash on the login page is exactly the
 * kind we want to hear about. Which is also why it is rate-limited per IP and
 * every field is truncated — a public endpoint that writes rows is a public
 * endpoint that writes rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/errors/log";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: NextRequest) {
  // 20 distinct reports a minute per IP is generous for a real user in a
  // crash loop and useless for anyone trying to fill the table.
  if (!rateLimit(`errors:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const message = str(body.message, 500);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  logError({
    source: "client",
    message,
    stack: str(body.stack, 4000) || null,
    path: str(body.path, 300) || null,
    meta: { ua: (req.headers.get("user-agent") ?? "").slice(0, 200) },
  });
  return NextResponse.json({ ok: true });
}
