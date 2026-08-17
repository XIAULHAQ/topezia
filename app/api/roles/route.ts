/**
 * GET /api/roles — the role taxonomy, grouped by field.
 *
 * Public: this same taxonomy already drives the /jobs/{role} SEO pages, so
 * there is nothing here a crawler cannot see. It exists as its own endpoint
 * because /api/profile only hands back roleGroups alongside a profile, and
 * the people who need a role picker most are the ones who don't have one yet.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Served dynamically and cached at the EDGE rather than prerendered.
 *
 * `export const revalidate` made Next prerender this at build time, which
 * quietly made a successful deploy depend on the database being reachable
 * from the build. Twice in one day a pooler blip failed the whole build —
 * once silently, so a fix sat unpublished while everything looked fine. The
 * caching is unchanged (an hour at the CDN, stale-while-revalidate); only the
 * build-time dependency is gone.
 */
export const dynamic = "force-dynamic";
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  const verticals = await prisma.vertical.findMany({
    where: { slug: { not: "unsorted" } },
    select: { name: true, roles: { select: { name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    roleGroups: verticals.filter((v) => v.roles.length > 0).map((v) => ({ field: v.name, roles: v.roles.map((r) => r.name) })),
  }, { headers: { "Cache-Control": CACHE } });
}
