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

export const revalidate = 3600; // the taxonomy changes on the order of never

export async function GET() {
  const verticals = await prisma.vertical.findMany({
    where: { slug: { not: "unsorted" } },
    select: { name: true, roles: { select: { name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    roleGroups: verticals.filter((v) => v.roles.length > 0).map((v) => ({ field: v.name, roles: v.roles.map((r) => r.name) })),
  });
}
