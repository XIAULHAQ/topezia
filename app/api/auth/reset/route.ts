/**
 * POST /api/auth/reset — send a password-reset email from US, not from Supabase.
 *
 * Two problems this replaces:
 *
 * 1. The mail came from Supabase's default sender and template, so it looked
 *    like it was from someone else's product.
 * 2. The link landed on localhost. supabase-js's resetPasswordForEmail was
 *    called with `redirectTo: window.location.origin`, and Supabase only
 *    honours a redirect_to that is on the project's allow-list — otherwise it
 *    silently falls back to the dashboard's Site URL, which was still the dev
 *    default. Two separate ways to end up pointing at a machine that isn't the
 *    user's.
 *
 * So we mint the recovery token with the admin API and mail it ourselves
 * through Resend, with a link straight to our own /reset. Supabase's redirect
 * machinery is never involved, so no dashboard allow-list entry is required for
 * this to work.
 *
 * Responds 200 with the same body whether or not the address has an account:
 * a different answer for a real address would turn this into a free
 * account-enumeration oracle.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, renderPasswordResetEmail } from "@/lib/alerts/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-IP throttle. Serverless instances don't share memory, so this slows a
// casual abuser rather than a distributed one — but it removes the free
// unlimited-send property, which otherwise lets anyone use us to mailbomb a
// third party (their address, our sending reputation).
const attempts = new Map<string, { n: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { n: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.n += 1;
  return rec.n > MAX_SENDS;
}

const OK = NextResponse.json({ ok: true });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let email: string;
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return OK;
  }
  if (!email || !email.includes("@")) return OK;

  const admin = createAdminClient();
  if (!admin) {
    // Misconfiguration, not a user error — say so rather than claiming we sent
    // mail that never left.
    console.error("[auth/reset] SUPABASE_SERVICE_ROLE_KEY missing; cannot mint recovery link");
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 500 });
  }

  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    // No such user is the expected path for a typo'd address, and must look
    // identical from outside.
    if (error || !data?.properties?.hashed_token) return OK;

    const { subject, html } = renderPasswordResetEmail(data.properties.hashed_token);
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    // Log for us, stay generic for the caller — a send failure shouldn't reveal
    // whether the address exists either.
    console.error("[auth/reset] failed to send reset email:", err);
  }

  return OK;
}
