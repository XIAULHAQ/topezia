/**
 * GET /api/taxonomy/roles — the role taxonomy grouped by field, for pickers.
 * Public and cacheable: it's the same list the SEO pages are generated from.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

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
