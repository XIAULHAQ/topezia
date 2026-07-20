/** POST /api/hq/logout — drop the dashboard session cookie. */
import { NextResponse } from "next/server";
import { HQ_COOKIE } from "@/lib/hq-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HQ_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
