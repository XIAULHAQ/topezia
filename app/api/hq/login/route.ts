/**
 * POST /api/hq/login — exchange the dashboard password for a signed session.
 *
 * The password never reaches a cookie; what gets stored is a short-lived HMAC
 * session (see lib/hq-auth.ts) in an httpOnly cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { HQ_COOKIE, passwordMatches, mintSession, rateLimited, clearAttempts, hqConfigured } from "@/lib/hq-auth";

export const runtime = "nodejs"; // node:crypto
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hqConfigured()) {
    return NextResponse.json({ error: "No dashboard password is configured on the server." }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
  }

  let password = "";
  try {
    password = ((await req.json()) as { password?: string }).password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    // Deliberately vague: never confirm whether a password merely "exists".
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  clearAttempts(ip);
  const { value, maxAge } = mintSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HQ_COOKIE, value, {
    maxAge,
    path: "/",
    httpOnly: true, // page scripts can never read it
    sameSite: "strict", // not sent on cross-site navigations
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
