/**
 * /login — sign up / log in. Server shell: resolves the `next` destination and
 * fetches the corpus counts the value panel quotes, then renders the form.
 *
 * Real accounts via Supabase Auth; on success any anonymous profile is linked
 * to the account and the person is routed on (see login-client).
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { LAST_UID_COOKIE } from "@/lib/anon-session";
import LoginClient, { type LoginStats, type Viewer } from "./login-client";

export const metadata: Metadata = {
  title: "Sign in — Topezia",
  description: "Sign in to Topezia for your AI career score, honest job matches and your roadmap. New here? Upload your resume and we build your profile in two minutes.",
  robots: { index: false, follow: true }, // an auth screen has no business in search
};

// Reads live counts per request.
export const dynamic = "force-dynamic";

/**
 * Only ever redirect to our OWN paths. `next` arrives from the query string,
 * so an absolute URL (or a protocol-relative "//evil.com") would otherwise be
 * an open redirect straight out of the sign-in flow.
 */
function safeNext(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}

async function getStats(): Promise<LoginStats | null> {
  try {
    const [jobs, projects] = await Promise.all([
      prisma.job.count({ where: { status: "LIVE", kind: "JOB" } }),
      prisma.job.count({ where: { status: "LIVE", kind: "PROJECT" } }),
    ]);
    return { jobs, projects };
  } catch {
    // A DB blip must never block someone signing in — the panel just shows
    // fewer cards.
    return null;
  }
}

/**
 * Who is at the keyboard, if we already know them — their own cookie on their
 * own device, so the greeting can use their name and CV photo instead of a
 * generic "Welcome back".
 *
 * Two real cases: someone who parsed a resume anonymously and is now creating
 * an account (we know them from the CV), and someone whose session lapsed but
 * whose profile cookie survived.
 */
async function getViewer(): Promise<Viewer | null> {
  try {
    const { userId, authed } = await currentIdentity();
    // After logout there is no session AND the anon cookie was cleared at
    // login, so fall back to the device's last-signed-in id — that is the
    // whole point of "Welcome back".
    const lastUid = cookies().get(LAST_UID_COOKIE)?.value || null;
    const lookupId = userId ?? lastUid;
    if (!lookupId) return null;
    const p = await prisma.profile.findUnique({ where: { userId: lookupId }, select: { fullName: true, photoUrl: true } });
    const firstName = p?.fullName?.trim().split(/\s+/)[0] ?? null;
    if (!firstName) return null;
    // Photos are stored as data URIs; skip an unusually large one rather than
    // inline hundreds of KB into a cold sign-in page (initials stand in).
    const photoUrl = p?.photoUrl && p.photoUrl.length <= 400_000 ? p.photoUrl : null;
    // Recognised via the last-signed-in cookie => they definitely have an
    // account, so the form stays in sign-in mode.
    return { firstName, photoUrl, hasAccount: authed || (!userId && !!lastUid) };
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const [stats, viewer] = await Promise.all([getStats(), getViewer()]);
  return <LoginClient next={safeNext(searchParams.next)} stats={stats} viewer={viewer} />;
}
