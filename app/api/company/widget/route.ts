/**
 * GET   /api/company/widget — widget status, usage, and the embed snippet.
 * POST  /api/company/widget — set the domain and (re)scan the site.
 * PATCH /api/company/widget — turn the widget on/off.
 *
 * Owner only. The crawl runs inside the POST — capped hard enough
 * (lib/widget/crawl.ts) to fit a serverless invocation; a bigger site gets
 * its first 40 pages, which is the free tier anyway.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { normalizeDomain, crawlSite } from "@/lib/widget/crawl";
import { usageThisMonth, FREE_LIMITS } from "@/lib/widget/caps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_SELECT = {
  id: true, domain: true, siteToken: true, enabled: true, branded: true,
  pagesCrawled: true, crawledAt: true, crawlError: true,
  monthKey: true, messagesUsed: true,
} as const;

async function view(site: { monthKey: string; messagesUsed: number } & Record<string, unknown>) {
  const usage = await usageThisMonth(site);
  const { monthKey: _mk, messagesUsed: _mu, ...rest } = site;
  return { ...rest, usage, limits: FREE_LIMITS };
}

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const site = await prisma.widgetSite.findUnique({ where: { companyId: auth.owner.companyId }, select: SITE_SELECT });
  return NextResponse.json({ site: site ? await view(site) : null });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId } = auth.owner;

  // Crawls fetch tens of pages of someone's site — a tight window is basic
  // manners toward the crawled host as much as toward our compute bill.
  if (!rateLimit(`widget-crawl:${userId}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await prisma.widgetSite.findUnique({ where: { companyId }, select: { id: true, domain: true } });

  // Re-scan keeps the saved domain when none is sent.
  const domainInput = body.domain ?? existing?.domain;
  const norm = normalizeDomain(domainInput);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });

  const site = existing
    ? await prisma.widgetSite.update({ where: { id: existing.id }, data: { domain: norm.host }, select: { id: true } })
    : await prisma.widgetSite.create({
        data: { companyId, domain: norm.host, siteToken: randomBytes(16).toString("base64url") },
        select: { id: true },
      });

  const crawl = await crawlSite(site.id, norm.host);

  const fresh = await prisma.widgetSite.findUnique({ where: { id: site.id }, select: SITE_SELECT });
  return NextResponse.json({ site: fresh ? await view(fresh) : null, crawl });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false." }, { status: 400 });
  }

  const updated = await prisma.widgetSite.updateMany({
    where: { companyId: auth.owner.companyId },
    data: { enabled: body.enabled },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Set up the widget first." }, { status: 404 });
  }
  return NextResponse.json({ enabled: body.enabled });
}
