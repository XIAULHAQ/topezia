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
import { companyLogoUrl } from "@/lib/company/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: {
      enabled: true, accentColor: true, greeting: true, pagesCrawled: true,
      proactive: true, proactiveDelay: true, proactiveSound: true,
      company: { select: { plan: true, name: true, logoPath: true } },
    },
  });

  // Enough for the loader to paint a REAL panel before the iframe exists:
  // the company's name, mark, colour and opening line. Without this the
  // visitor stares at an empty rectangle for as long as the page takes to
  // render, and concludes the chat is broken.
  const body = site?.enabled
    ? {
        enabled: true,
        accent: planFor(site.company).theming ? normalizeAccent(site.accentColor) : null,
        name: site.company.name,
        logo: companyLogoUrl(site.company.logoPath),
        greeting:
          site.greeting?.trim() ||
          (site.pagesCrawled > 0
            ? `Hi — I'm the ${site.company.name} AI assistant. Ask me anything.`
            : `Hi — leave a message and the ${site.company.name} team will get back to you.`),
        proactive: site.proactive,
        proactiveDelay: Math.min(Math.max(site.proactiveDelay, 3), 300),
        sound: site.proactiveSound,
      }
    : { enabled: false, accent: null };

  return NextResponse.json(body, {
    headers: {
      // Serve stale instantly, refresh behind the visitor's back.
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
