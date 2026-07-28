/**
 * GET /api/alerts/status?slug=&place= — is this signed-in user already
 * subscribed to this saved search? Backs the /feed alert toggle, which
 * (unlike the public /jobs email-capture form) never asks for an address —
 * it reads the account's own verified email instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { resolveAlertTarget, alertQueryKey } from "@/lib/alerts/query";

export async function GET(req: NextRequest) {
  const { authed } = await currentIdentity();
  if (!authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch { /* fall through to the no-email case below */ }
  if (!email) return NextResponse.json({ error: "No email on this account." }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  const place = req.nextUrl.searchParams.get("place");

  const target = await resolveAlertTarget(slug, place);
  if (!target) return NextResponse.json({ error: "Unknown job search." }, { status: 404 });

  const queryKey = alertQueryKey(target);
  const row = await prisma.jobAlert.findUnique({
    where: { email_queryKey: { email, queryKey } },
    select: { unsubscribedAt: true },
  });
  return NextResponse.json({ subscribed: !!row && !row.unsubscribedAt, label: target.label });
}
