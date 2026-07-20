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

/**
 * Two limits, because they defend different things.
 *
 * The abuse that matters is mailbombing: pointing this at someone else's
 * address repeatedly. That is bounded per ADDRESS, and only counted when mail
 * actually goes out. A first cut counted every request per IP instead, which
 * punished the wrong people — a typo, a no-op lookup for an address with no
 * account, even a health check all consumed the budget, and everyone behind one
 * office NAT or phone carrier shares an IP, so a handful of colleagues could
 * lock each other out. It also fired on my own verification requests and locked
 * out the owner's browser on the same connection after two real attempts.
 *
 * The per-IP limit stays, but only to stop someone hammering the endpoint (each
 * request costs a Supabase admin call), so it is set far above what any human
 * resetting their own password would reach.
 *
 * Serverless instances don't share memory, so both are best-effort: they stop
 * a casual abuser, not a distributed one.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_EMAIL = 3;
const MAX_REQUESTS_PER_IP = 30;

const sends = new Map<string, { n: number; resetAt: number }>();
const requests = new Map<string, { n: number; resetAt: number }>();

function bump(store: Map<string, { n: number; resetAt: number }>, key: string, max: number): boolean {
  const now = Date.now();
  const rec = store.get(key);
  if (!rec || now > rec.resetAt) {
    store.set(key, { n: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.n += 1;
  return rec.n > max;
}

const OK = NextResponse.json({ ok: true });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (bump(requests, ip, MAX_REQUESTS_PER_IP)) {
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
    // identical from outside. Costs the sender nothing, so it isn't counted.
    if (error || !data?.properties?.hashed_token) return OK;

    // Counted here, immediately before mail leaves — this is the budget that
    // actually protects the recipient's inbox.
    if (bump(sends, email, MAX_SENDS_PER_EMAIL)) return OK;

    const { subject, html } = renderPasswordResetEmail(data.properties.hashed_token);
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    // Log for us, stay generic for the caller — a send failure shouldn't reveal
    // whether the address exists either.
    console.error("[auth/reset] failed to send reset email:", err);
  }

  return OK;
}
