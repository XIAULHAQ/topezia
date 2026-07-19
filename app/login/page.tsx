/**
 * /login — sign up / log in. Server shell: resolves the `next` destination and
 * fetches the corpus counts the value panel quotes, then renders the form.
 *
 * Real accounts via Supabase Auth; on success any anonymous profile is linked
 * to the account and the person is routed on (see login-client).
 */
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import LoginClient, { type LoginStats } from "./login-client";

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

export default async function LoginPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const [stats] = await Promise.all([getStats()]);
  return <LoginClient next={safeNext(searchParams.next)} stats={stats} />;
}
