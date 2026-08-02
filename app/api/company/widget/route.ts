/**
 * GET    /api/company/widget            — every site this company runs.
 * POST   /api/company/widget            — add a site, or re-scan one.
 * PATCH  /api/company/widget            — change one site's settings.
 * DELETE /api/company/widget?siteId=    — remove a site.
 *
 * Owner only. A company may run as many sites as its plan allows
 * (lib/billing/plans.ts) — one on Free and Pro, ten on Studio — and that
 * ceiling is enforced HERE rather than by the database, so raising it is an
 * edit to the plan table.
 *
 * Every write takes an explicit siteId and scopes it by companyId: the
 * `where` IS the authorization, so another company's site id reads as
 * absent rather than as a permission error.
 *
 * The crawl runs inside the POST, capped to fit a serverless invocation.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { normalizeDomain, crawlSite } from "@/lib/widget/crawl";
import { usageThisMonth } from "@/lib/widget/caps";
import { normalizeAccent, parseReplyHours } from "@/lib/widget/presence";
import { planFor } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PLAN_SELECT = { plan: true, aiMonthKey: true, aiRepliesUsed: true } as const;

const SITE_SELECT = {
  id: true, domain: true, siteToken: true, enabled: true, branded: true,
  digestEnabled: true, pagesCrawled: true, crawledAt: true, crawlError: true,
  accentColor: true, replyHours: true, storeKind: true, orderLookup: true,
  greeting: true, proactive: true, proactiveDelay: true, proactiveSound: true, askContact: true,
  monthKey: true, messagesUsed: true,
} as const;

type Company = { plan: string; aiMonthKey: string; aiRepliesUsed: number } | null;

async function view(site: { monthKey: string; messagesUsed: number } & Record<string, unknown>, company: Company) {
  const usage = await usageThisMonth(site, company);
  const { monthKey: _mk, messagesUsed: _mu, ...rest } = site;
  return { ...rest, usage };
}

/**
 * What the chat has produced, per site AND in total. Leads are counted rows;
 * won and revenue are ONLY what the owner marked and typed — nothing here is
 * estimated, and a company that marks nothing sees zeros, which is the truth
 * about what we know.
 *
 * Grouped in one pass rather than per site: an agency on ten sites shouldn't
 * cost thirty queries to render one page.
 */
async function attribution(companyId: string) {
  const rows = await prisma.companyInquiry.groupBy({
    by: ["siteId", "outcome"],
    where: { companyId, source: "WIDGET" },
    _count: { _all: true },
    _sum: { dealValue: true },
  });

  const bySite = new Map<string, { leads: number; won: number; revenue: number }>();
  const total = { leads: 0, won: 0, revenue: 0 };
  for (const r of rows) {
    const key = r.siteId ?? "";
    const cur = bySite.get(key) ?? { leads: 0, won: 0, revenue: 0 };
    cur.leads += r._count._all;
    total.leads += r._count._all;
    if (r.outcome === "WON") {
      cur.won += r._count._all;
      cur.revenue += r._sum.dealValue ?? 0;
      total.won += r._count._all;
      total.revenue += r._sum.dealValue ?? 0;
    }
    bySite.set(key, cur);
  }
  return { bySite, total };
}

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  const [sites, stats, company] = await Promise.all([
    prisma.widgetSite.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, select: SITE_SELECT }),
    attribution(companyId),
    prisma.company.findUnique({ where: { id: companyId }, select: PLAN_SELECT }),
  ]);
  const plan = planFor(company);

  return NextResponse.json({
    sites: await Promise.all(
      sites.map(async (s) => ({ ...(await view(s, company)), stats: stats.bySite.get(s.id) ?? { leads: 0, won: 0, revenue: 0 } }))
    ),
    stats: stats.total,
    plan: plan.id,
    limits: plan,
    // Pooled budgets are a whole-account number, so the page can show one
    // bar for the company rather than a misleading one per site.
    pooled: plan.sites > 1,
    canAddSite: sites.length < plan.sites,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId } = auth.owner;

  // Crawls fetch tens of pages of someone's site — a tight window is basic
  // manners toward the crawled host as much as toward our compute bill.
  if (!rateLimit(`widget-crawl:${userId}`, 8, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: PLAN_SELECT });
  const plan = planFor(company);

  // Re-scan an existing site, or add a new one.
  const siteId = typeof body.siteId === "string" && body.siteId ? body.siteId : null;
  const existing = siteId
    ? await prisma.widgetSite.findFirst({ where: { id: siteId, companyId }, select: { id: true, domain: true } })
    : null;
  if (siteId && !existing) {
    return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });
  }

  if (!existing) {
    const count = await prisma.widgetSite.count({ where: { companyId } });
    if (count >= plan.sites) {
      return NextResponse.json(
        {
          error: plan.sites === 1
            ? "Your plan covers one website. Studio covers ten."
            : `Your plan covers ${plan.sites} websites.`,
          upgrade: true,
        },
        { status: 402 }
      );
    }
  }

  const norm = normalizeDomain(body.domain ?? existing?.domain);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });

  // The same domain twice would mean two sets of answers for one website and
  // two budgets to reconcile — almost certainly a mistake, not an intent.
  const clash = await prisma.widgetSite.findFirst({
    where: { companyId, domain: norm.host, ...(existing ? { id: { not: existing.id } } : {}) },
    select: { id: true },
  });
  if (clash) return NextResponse.json({ error: `${norm.host} is already set up.` }, { status: 409 });

  const site = existing
    ? await prisma.widgetSite.update({ where: { id: existing.id }, data: { domain: norm.host }, select: { id: true } })
    : await prisma.widgetSite.create({
        data: { companyId, domain: norm.host, siteToken: randomBytes(16).toString("base64url") },
        select: { id: true },
      });

  const crawl = await crawlSite(site.id, norm.host, plan.pages);

  const fresh = await prisma.widgetSite.findUnique({ where: { id: site.id }, select: SITE_SELECT });
  return NextResponse.json({ site: fresh ? await view(fresh, company) : null, crawl });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (!siteId) return NextResponse.json({ error: "Which website?" }, { status: 400 });

  // Prisma spells "write SQL NULL into a Json column" as DbNull, not null.
  const data: Prisma.WidgetSiteUpdateManyMutationInput = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.digestEnabled === "boolean") data.digestEnabled = body.digestEnabled;
  if ("accentColor" in body) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true } });
    if (!planFor(company).theming) {
      return NextResponse.json({ error: "Custom colours are part of Pro.", upgrade: true }, { status: 402 });
    }
    // Null clears it back to Topezia's gradient; anything that isn't a hex
    // colour is refused rather than quietly coerced into one.
    if (body.accentColor === null) data.accentColor = null;
    else {
      const accent = normalizeAccent(body.accentColor);
      if (!accent) return NextResponse.json({ error: "Use a colour like #8B5CF6." }, { status: 400 });
      data.accentColor = accent;
    }
  }
  if ("greeting" in body) {
    const g = typeof body.greeting === "string" ? body.greeting.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    data.greeting = g || null; // empty restores the page-aware opener
  }
  if (typeof body.proactive === "boolean") data.proactive = body.proactive;
  if (typeof body.proactiveDelay === "number" && Number.isFinite(body.proactiveDelay)) {
    data.proactiveDelay = Math.min(Math.max(Math.round(body.proactiveDelay), 3), 300);
  }
  if (typeof body.proactiveSound === "boolean") data.proactiveSound = body.proactiveSound;
  if (typeof body.askContact === "boolean") data.askContact = body.askContact;
  if (typeof body.orderLookup === "boolean") {
    // Turning it ON requires a store that is actually connected — otherwise
    // the chat would invite order numbers it has no way to check.
    if (body.orderLookup) {
      const store = await prisma.siteStoreCredential.findUnique({ where: { siteId }, select: { id: true } });
      if (!store) {
        return NextResponse.json({ error: "Connect your store first — there's nothing to look orders up in yet." }, { status: 400 });
      }
    }
    data.orderLookup = body.orderLookup;
  }
  if ("replyHours" in body) {
    if (body.replyHours === null) data.replyHours = Prisma.DbNull;
    else {
      const hours = parseReplyHours(body.replyHours);
      if (!hours) return NextResponse.json({ error: "Pick at least one day and a start and end time." }, { status: 400 });
      data.replyHours = hours;
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // Scoped by companyId as well as id — the where IS the authorization.
  const updated = await prisma.widgetSite.updateMany({ where: { id: siteId, companyId }, data });
  if (updated.count === 0) {
    return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const siteId = new URL(req.url).searchParams.get("siteId") ?? "";
  if (!siteId) return NextResponse.json({ error: "Which website?" }, { status: 400 });

  // Cascades take the crawl, the products, the taught answers and the
  // question log with it — all of which are about that site. The LEADS are
  // not: CompanyInquiry.siteId is ON DELETE SET NULL, so the business the
  // site produced stays in the inbox.
  const deleted = await prisma.widgetSite.deleteMany({ where: { id: siteId, companyId: auth.owner.companyId } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
