/**
 * POST /api/connect/wordpress/approve — the human says yes.
 *
 * This is where a pending handshake becomes a real company profile, a real
 * website and a real crawl. It is the ONLY writer of WpConnect.status =
 * APPROVED, and it requires a signed-in account: a subscription, an inbox and
 * a public company page all need someone we can actually reach.
 *
 * TWO RULES ABOUT THE DETECTED DETAILS.
 *
 * They are only ever used to FILL BLANKS. A company that has already written
 * its own About text keeps it — a plugin that could overwrite a public page
 * with whatever a WordPress install claimed would be a defacement tool, and
 * "I reinstalled the plugin and it rewrote my profile" is not a support
 * ticket anyone should have to file.
 *
 * And they are re-sanitised HERE from the row, not taken from the browser.
 * The client sends only choices — which fields to accept — never values. So
 * the worst a tampered request can do is accept something the person could
 * already see on the approval screen.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { normalizeDomain, crawlSite, type CrawlResult } from "@/lib/widget/crawl";
import { planFor } from "@/lib/billing/plans";
import { sanitizeDetails } from "@/lib/wordpress/connect";
import { fetchLogo } from "@/lib/wordpress/logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The crawl runs inside this request, exactly as it does when a site is added
// by hand. Same ceiling as /api/company/widget.
export const maxDuration = 120;

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "company";

export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) {
    return NextResponse.json({ error: "Sign in to connect your website." }, { status: 401 });
  }
  if (!rateLimit(`wp-approve:${userId}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const state = typeof body.state === "string" ? body.state : "";
  if (!state) return NextResponse.json({ error: "Missing connection." }, { status: 400 });

  const row = await prisma.wpConnect.findUnique({
    where: { state },
    select: { id: true, host: true, siteUrl: true, details: true, status: true, expiresAt: true },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This connection has expired. Start again from WordPress." }, { status: 410 });
  }
  if (row.status !== "PENDING" && row.status !== "APPROVED") {
    return NextResponse.json({ error: "This connection has already been used." }, { status: 409 });
  }

  const norm = normalizeDomain(row.host);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });

  // Re-sanitised from the stored row. The client sends choices, never values.
  const detected = sanitizeDetails(row.details);
  const accept = (body.accept && typeof body.accept === "object" ? body.accept : {}) as Record<string, unknown>;
  const wants = (field: string) => accept[field] !== false; // default yes

  // ── The company ──────────────────────────────────────────────────────
  let company = await prisma.company.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, name: true, tagline: true, about: true, website: true, location: true, logoPath: true, plan: true },
  });

  if (!company) {
    const name = (wants("name") && detected.name) || norm.host;
    const base = slugify(name);
    for (let i = 0; i < 6 && !company; i++) {
      const slug = i === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
      try {
        company = await prisma.company.create({
          data: {
            ownerUserId: userId,
            slug,
            name,
            tagline: (wants("tagline") && detected.tagline) || null,
            about: (wants("about") && detected.about) || null,
            website: row.siteUrl,
            location: (wants("address") && detected.address) || null,
          },
          select: { id: true, name: true, tagline: true, about: true, website: true, location: true, logoPath: true, plan: true },
        });
      } catch {
        /* slug collision — retry with a suffix */
      }
    }
    if (!company) return NextResponse.json({ error: "Couldn't create your company — try again." }, { status: 502 });
  } else {
    // FILL BLANKS ONLY. Anything they have already written stays theirs.
    const fill: Record<string, string> = {};
    if (!company.tagline && wants("tagline") && detected.tagline) fill.tagline = detected.tagline;
    if (!company.about && wants("about") && detected.about) fill.about = detected.about;
    if (!company.website) fill.website = row.siteUrl;
    if (!company.location && wants("address") && detected.address) fill.location = detected.address;
    if (Object.keys(fill).length) {
      await prisma.company.update({ where: { id: company.id }, data: fill });
    }
  }

  // The logo is fetched server-side and stored in our own bucket rather than
  // hotlinked: their media library is not a CDN we may lean on, and a URL
  // that 404s later would leave a broken image on a public page.
  if (!company.logoPath && wants("logo") && detected.logoUrl) {
    const path = await fetchLogo(detected.logoUrl, company.id);
    if (path) await prisma.company.update({ where: { id: company.id }, data: { logoPath: path } });
  }

  // ── The website ──────────────────────────────────────────────────────
  const plan = planFor(company);
  const existing = await prisma.widgetSite.findFirst({
    where: { companyId: company.id, domain: norm.host },
    select: { id: true },
  });

  if (!existing) {
    const count = await prisma.widgetSite.count({ where: { companyId: company.id } });
    if (count >= plan.sites) {
      return NextResponse.json(
        {
          error: plan.sites === 1
            ? "Your plan covers one website, and you already have one set up. Studio covers ten."
            : `Your plan covers ${plan.sites} websites and they're all in use.`,
          upgrade: true,
        },
        { status: 402 }
      );
    }
  }

  const site = existing
    ? await prisma.widgetSite.update({ where: { id: existing.id }, data: { enabled: true }, select: { id: true } })
    : await prisma.widgetSite.create({
        data: { companyId: company.id, domain: norm.host, siteToken: randomBytes(16).toString("base64url") },
        select: { id: true },
      });

  // Approve BEFORE the crawl. The crawl is slow and may partially fail; the
  // connection itself is already a decision the person made, and losing it
  // to a timeout would send them back to the start for no reason.
  await prisma.wpConnect.update({
    where: { id: row.id },
    data: { status: "APPROVED", companyId: company.id, siteId: site.id, approvedUserId: userId, approvedAt: new Date() },
  });

  // A scan already running for this site (a re-connect racing a re-scan) comes
  // back busy rather than crawling. The CONNECTION still stands — it was
  // approved above and is the thing the person actually asked for; the
  // approval screen shows crawl.error as a warning and they can re-scan.
  let crawl: CrawlResult | null = null;
  try {
    crawl = await crawlSite(site.id, norm.host, plan.pages);
  } catch (err) {
    console.error("[wp-connect] crawl failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    company: { name: company.name },
    site: { domain: norm.host },
    crawl,
    plan: plan.id,
  });
}
