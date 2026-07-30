/**
 * GET  /api/company/work — every piece of work the signed-in owner has, draft
 *                          and published, for the dashboard.
 * POST /api/company/work — create one.
 *
 * Ownership is the Company row (lib/company/owner.ts). Validation, spam
 * scoring and the storage-path check all live in lib/company/save.ts, so the
 * create and update paths can't drift apart on what "valid" means.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateWork, makeSlug, type WorkInput } from "@/lib/company/save";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A hard ceiling, not a plan tier: a company with 200 case studies is a
 *  scraper dump, and the dashboard list stops being usable long before that. */
const MAX_WORK = 60;

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const work = await prisma.companyWork.findMany({
    where: { companyId: auth.owner.companyId },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: { images: { orderBy: { position: "asc" } } },
  });

  return NextResponse.json({ work, companySlug: auth.owner.slug });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, slug: companySlug } = auth.owner;

  if (!rateLimit(`company-work:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: WorkInput;
  try {
    body = (await req.json()) as WorkInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const count = await prisma.companyWork.count({ where: { companyId } });
  if (count >= MAX_WORK) {
    return NextResponse.json({ error: `You can showcase up to ${MAX_WORK} pieces of work.` }, { status: 409 });
  }

  const result = validateWork(body, companyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { images, ...v } = result.value;

  const work = await prisma.companyWork.create({
    data: {
      ...v,
      companyId,
      slug: makeSlug(v.title, "work"),
      position: count,
      publishedAt: v.status === "PUBLISHED" ? new Date() : null,
      images: images.length ? { createMany: { data: images } } : undefined,
    },
    include: { images: { orderBy: { position: "asc" } } },
  });

  // The company page is cached (revalidate 900); without this the new work
  // wouldn't appear there for up to fifteen minutes.
  revalidatePath(`/company/${companySlug}`);
  return NextResponse.json({ work });
}
