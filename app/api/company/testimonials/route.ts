/**
 * GET  /api/company/testimonials — the owner's list, hidden ones included.
 * POST /api/company/testimonials — add one.
 *
 * These are quotes the COMPANY typed in. Nothing about them is verified, and
 * the public page says so — see app/company/[slug]/page.tsx. That honesty is
 * the whole reason they are a separate table from Endorsement, which requires
 * a signed-in third party writing through a link the subject cannot edit.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateTestimonial } from "@/lib/company/save";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TESTIMONIALS = 40;

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const testimonials = await prisma.companyTestimonial.findMany({
    where: { companyId: auth.owner.companyId },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ testimonials });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, slug: companySlug } = auth.owner;

  if (!rateLimit(`company-testimonial:${userId}`, 40, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const count = await prisma.companyTestimonial.count({ where: { companyId } });
  if (count >= MAX_TESTIMONIALS) {
    return NextResponse.json({ error: `You can list up to ${MAX_TESTIMONIALS} testimonials.` }, { status: 409 });
  }

  const result = validateTestimonial(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const testimonial = await prisma.companyTestimonial.create({
    data: { ...result.value, companyId, position: count },
  });

  revalidatePath(`/company/${companySlug}`);
  return NextResponse.json({ testimonial });
}
