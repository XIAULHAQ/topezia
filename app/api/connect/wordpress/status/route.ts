/**
 * POST /api/connect/wordpress/status — what the plugin's dashboard shows.
 *
 * Authenticated by the PLUGIN key, not the site key. The site key is in
 * every visitor's page source; answering "how many leads this month?" to
 * whoever holds it would publish the customer's pipeline. The plugin key was
 * handed to their server at the end of the handshake and exists nowhere else.
 *
 * Counts only. No lead names, no message text, no email addresses — those
 * live in the inbox, behind a real sign-in, and a WordPress admin is not
 * automatically the person entitled to read them. The plugin links out.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { hashToken } from "@/lib/wordpress/connect";
import { usageThisMonth } from "@/lib/widget/caps";
import { planFor } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") ?? "").trim() || "unknown";
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`wp-status:${clientIp(req)}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const key = typeof body.plugin_key === "string" ? body.plugin_key : "";
  if (!key) return NextResponse.json({ error: "Missing key." }, { status: 400 });

  const site = await prisma.widgetSite.findFirst({
    where: { pluginKeyHash: hashToken(key) },
    select: {
      id: true, domain: true, enabled: true, branded: true, siteToken: true,
      pagesCrawled: true, crawledAt: true, crawlError: true,
      monthKey: true, messagesUsed: true,
      company: { select: { id: true, name: true, slug: true, plan: true, aiMonthKey: true, aiRepliesUsed: true, brandingDiscount: true } },
    },
  });

  // A revoked or rotated key reads as "not connected", which is exactly what
  // the plugin should show — it prompts a reconnect rather than an error.
  if (!site) {
    return NextResponse.json({ status: "disconnected", error: "This site is no longer connected to Topezia." }, { status: 401 });
  }

  const plan = planFor(site.company);
  const usage = await usageThisMonth(site, site.company);

  const [leads, unanswered] = await Promise.all([
    prisma.companyInquiry.count({ where: { siteId: site.id, source: "WIDGET" } }),
    prisma.widgetQuestion.count({ where: { siteId: site.id, answered: false } }),
  ]);

  return NextResponse.json({
    status: "ok",
    site: {
      domain: site.domain,
      enabled: site.enabled,
      site_key: site.siteToken,
      pages: site.pagesCrawled,
      crawled_at: site.crawledAt,
      crawl_error: site.crawlError,
      // True when the free-tier line or the paid badge trade is showing.
      branded: site.branded || site.company.brandingDiscount,
    },
    company: { name: site.company.name, slug: site.company.slug },
    plan: {
      id: plan.id,
      name: plan.name,
      replies_used: usage.used,
      replies_included: usage.limit,
      pages_included: plan.pages,
    },
    leads,
    unanswered,
  });
}
