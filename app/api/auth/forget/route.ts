/**
 * GET /api/auth/forget — drop the "last signed in on this device" cookie and
 * return to a clean sign-in page.
 *
 * Backs the "Not you?" link: the greeting is a convenience, so there has to be
 * a one-click way off it (shared laptops, handed-over phones).
 */
import { NextResponse, type NextRequest } from "next/server";
import { LAST_UID_COOKIE } from "@/lib/anon-session";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set(LAST_UID_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
