/**
 * GET /api/widget/{token}/config — the two things the LOADER needs before
 * the iframe exists: the launcher's colour, and whether the chat is on.
 *
 * Public and deliberately tiny. The token identifies a site and authorizes
 * nothing, and this returns nothing a visitor couldn't see by opening the
 * chat. Cached at the edge — a launcher colour changing a few minutes late
 * is worth not hitting the database on every page view of every customer.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAccent } from "@/lib/widget/presence";
import { planFor } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: { enabled: true, accentColor: true, company: { select: { plan: true } } },
  });

  const body = site?.enabled
    ? { enabled: true, accent: planFor(site.company).theming ? normalizeAccent(site.accentColor) : null }
    : { enabled: false, accent: null };

  return NextResponse.json(body, {
    headers: {
      // Serve stale instantly, refresh behind the visitor's back.
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
