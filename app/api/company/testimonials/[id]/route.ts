/**
 * PATCH  /api/company/testimonials/{id} — edit one.
 * DELETE /api/company/testimonials/{id} — remove it.
 *
 * `where: { id, companyId }` is the authorization, not a filter applied after
 * loading — the same posture as every other company write route.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateTestimonial } from "@/lib/company/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateTestimonial(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const r = await prisma.companyTestimonial.updateMany({
    where: { id: params.id, companyId },
    data: result.value,
  });
  if (r.count === 0) return NextResponse.json({ error: "That testimonial no longer exists." }, { status: 404 });

  revalidatePath(`/company/${companySlug}`);
  const testimonial = await prisma.companyTestimonial.findUnique({ where: { id: params.id } });
  return NextResponse.json({ testimonial });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const r = await prisma.companyTestimonial.deleteMany({ where: { id: params.id, companyId: auth.owner.companyId } });
  if (r.count === 0) return NextResponse.json({ error: "That testimonial no longer exists." }, { status: 404 });

  revalidatePath(`/company/${auth.owner.slug}`);
  return NextResponse.json({ deleted: true });
}
