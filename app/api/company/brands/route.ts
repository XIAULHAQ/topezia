/**
 * /api/company/brands — the groups of domains that share one knowledge base.
 *
 * A brand is the SAFETY boundary for retrieval (migration 070): a chat may
 * draw on every domain in its brand and none outside it. So everything here
 * is scoped to the signed-in owner's company twice over — the WHERE clause IS
 * the authorization, exactly as in /api/company/widget — and a site can only
 * ever be moved into a brand the same company owns. Getting that wrong would
 * let one Studio client's chat answer with another client's content, which is
 * the single failure this whole feature exists to prevent.
 *
 * Brands are NOT billed. Domains are what count against the plan; this only
 * decides what shares knowledge. The ceiling below exists to stop unbounded
 * row creation, not to sell anything.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { planFor } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const name = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80) : "");

const PLAN_SELECT = { plan: true } as const;

/** Brands with their sites — the shape the settings page renders. */
async function listBrands(companyId: string) {
  const brands = await prisma.siteBrand.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      sites: {
        where: { companyId },
        orderBy: { createdAt: "asc" },
        select: { id: true, domain: true, enabled: true },
      },
    },
  });
  // A site that somehow has no brand still has to be visible and movable, or
  // it would be invisible in the UI and unreachable by any control.
  const unbranded = await prisma.widgetSite.findMany({
    where: { companyId, brandId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, domain: true, enabled: true },
  });
  return { brands, unbranded };
}

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listBrands(auth.owner.companyId));
}

/** Create a brand. Empty to begin with; sites are moved into it after. */
export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const wanted = name(body.name);
  if (!wanted) return NextResponse.json({ error: "Give the brand a name." }, { status: 400 });

  // You cannot need more brands than you have domains — one each is the most
  // separation that can mean anything, and it bounds the table.
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: PLAN_SELECT });
  const plan = planFor(company);
  const count = await prisma.siteBrand.count({ where: { companyId } });
  if (count >= plan.sites) {
    return NextResponse.json(
      { error: `Your plan covers ${plan.sites} ${plan.sites === 1 ? "website" : "websites"}, so ${plan.sites} ${plan.sites === 1 ? "brand" : "brands"} is the most that can mean anything.` },
      { status: 402 }
    );
  }

  const brand = await prisma.siteBrand.create({
    data: { companyId, name: wanted },
    select: { id: true, name: true },
  });
  return NextResponse.json({ brand });
}

/**
 * Rename a brand, or move a site into one.
 *
 * Two small operations rather than two routes, because the page does both
 * from the same card and neither is worth its own file.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Move a site into a brand ──
  if (typeof body.siteId === "string" && body.siteId) {
    const brandId = typeof body.brandId === "string" && body.brandId ? body.brandId : null;
    if (!brandId) return NextResponse.json({ error: "Which brand?" }, { status: 400 });

    // BOTH must belong to this company. Checked against the row, not taken on
    // trust from the request — this is the line that keeps one customer's
    // pages out of another customer's chat.
    const [site, brand] = await Promise.all([
      prisma.widgetSite.findFirst({ where: { id: body.siteId, companyId }, select: { id: true } }),
      prisma.siteBrand.findFirst({ where: { id: brandId, companyId }, select: { id: true } }),
    ]);
    if (!site) return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });
    if (!brand) return NextResponse.json({ error: "That brand no longer exists." }, { status: 404 });

    await prisma.widgetSite.update({ where: { id: site.id }, data: { brandId: brand.id } });
    return NextResponse.json(await listBrands(companyId));
  }

  // ── Rename ──
  const id = typeof body.id === "string" ? body.id : "";
  const wanted = name(body.name);
  if (!id) return NextResponse.json({ error: "Which brand?" }, { status: 400 });
  if (!wanted) return NextResponse.json({ error: "Give the brand a name." }, { status: 400 });

  // updateMany's where IS the authorization — same pattern as /api/company.
  const r = await prisma.siteBrand.updateMany({ where: { id, companyId }, data: { name: wanted } });
  if (r.count === 0) return NextResponse.json({ error: "That brand no longer exists." }, { status: 404 });
  return NextResponse.json(await listBrands(companyId));
}

/**
 * Delete an EMPTY brand.
 *
 * Only empty. The database would set its sites' brandId to null rather than
 * delete them, which is the right safety net but a poor experience: the
 * websites would quietly become islands that answer from themselves alone,
 * with nothing on screen explaining why. Move the sites first, deliberately.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which brand?" }, { status: 400 });

  const brand = await prisma.siteBrand.findFirst({
    where: { id, companyId },
    select: { id: true, _count: { select: { sites: true } } },
  });
  if (!brand) return NextResponse.json({ error: "That brand no longer exists." }, { status: 404 });
  if (brand._count.sites > 0) {
    return NextResponse.json(
      { error: "Move its websites to another brand first — deleting this would leave them answering only from themselves." },
      { status: 409 }
    );
  }

  await prisma.siteBrand.delete({ where: { id: brand.id } });
  return NextResponse.json(await listBrands(companyId));
}
