/**
 * GET /api/taxonomy/roles — the role taxonomy grouped by field, for pickers.
 * Public and cacheable.
 *
 * EVERY category is returned, including ones with no roles yet. This list is
 * what the post form offers, and filtering out empty categories meant a whole
 * sector could not post at all: "Retail & Hospitality" shipped with zero
 * roles, so a restaurant hiring waiters found no category, and the form
 * requires one. Category coverage is our gap to fix, never the employer's
 * problem to work around.
 *
 * A thin category does NOT become a thin public page as a result: what a
 * category page is allowed to do is decided by how many LIVE jobs it holds
 * (the indexability floors in lib/seo/pages.ts), not by whether it appears in
 * this picker. An empty category renders noindex and is left out of the
 * sitemap and the sibling lattice until real postings fill it.
 *
 * `slug` is included so the form can offer "something else in this category"
 * — a posting that carries the category with no role attached. Matching is
 * driven by the embedding and the skills, so such a posting still ranks; it
 * simply doesn't belong to a role hub yet.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

export async function GET() {
  const verticals = await prisma.vertical.findMany({
    // "unsorted" stays out: it is the internal fallback bucket for jobs we
    // couldn't classify, not a thing anyone should choose.
    where: { slug: { not: "unsorted" } },
    select: { name: true, slug: true, roles: { select: { name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    roleGroups: verticals.map((v) => ({ field: v.name, slug: v.slug, roles: v.roles.map((r) => r.name) })),
  });
}
